import { createHash } from 'node:crypto';
import { prisma, json, type Transaction, Prisma } from '../db/client';
import { freshMember, publicUserFields, hashPassword, type Member } from '../auth/sessions';
import { type Asset, roles, conditions, requestTypes, expandRange, splitAmounts, classify } from '../contracts/domain';
import { ApiError, clean, allow, now, id, asset, audit, dimensions, financialData, insertAsset, validated, getSource } from './asset-service';

type Input = Record<string, any>;
function split(quantity: number, total: number, take: number) {
  try { return splitAmounts(quantity, total, take); }
  catch { throw new ApiError('จำนวนที่แบ่งต้องเป็นจำนวนเต็ม ตั้งแต่ 1 ถึงจำนวนเดิมลบ 1'); }
}
export async function mutate(member: Member, input: Input) {
  const action = clean(input.action, 50), token = clean(input.token || id(), 100);
  const requestHash = createHash('sha256').update(json(input)).digest('hex');
  const passwordHash = action === 'user' && input.password ? await hashPassword(input.password) : undefined;
  const replay = (existing: { actor: string; requestHash: string; response: string }) => {
    if (existing.actor !== member.id || (existing.requestHash && existing.requestHash !== requestHash)) throw new ApiError('รหัสคำขอนี้ใช้กับข้อมูลอื่นแล้ว กรุณาเปิดฟอร์มใหม่', 409);
    return { ...JSON.parse(existing.response), ok: true, replayed: true };
  };
  const isolationLevel: Prisma.TransactionIsolationLevel = ['split', 'approve', 'reject'].includes(action) ? 'Serializable' : 'ReadCommitted';
  try {
    return await prisma.$transaction(async tx => {
      const m = await freshMember(tx, member);
      const existing = await tx.operation.findUnique({ where: { id: token } });
      if (existing) return replay(existing);
      const result = await perform(tx, m, action, input, passwordHash);
      await tx.operation.create({ data: { id: token, valid: 1, actor: m.id, createdAt: now(), requestHash, response: json(result) } });
      return result;
    }, { isolationLevel, maxWait: 15000, timeout: 45000 });
  } catch (error) {
    // A concurrent identical request may have committed while this transaction rolled back.
    if (['P2002', 'P2034'].includes((error as { code?: string }).code || '')) {
      const existing = await prisma.operation.findUnique({ where: { id: token } });
      if (existing) return replay(existing);
    }
    throw error;
  }
}

async function perform(tx: Transaction, m: Member, action: string, b: Input, passwordHash?: string): Promise<Input> {
  if (action === 'user') {
    allow(m, ['admin']);
    const email = clean(b.email, 200).toLowerCase(), role = clean(b.role, 20), name = clean(b.name, 200);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.hasOwn(roles, role)) throw new ApiError('ชื่อ อีเมล หรือบทบาทไม่ถูกต้อง');
    const target = await tx.user.findUnique({ where: { email }, select: publicUserFields }), active = b.active === false ? 0 : 1;
    if (target?.id === m.id && (role !== 'admin' || !active)) throw new ApiError('ไม่สามารถปิดสิทธิ์ Admin ของตนเอง');
    if (!target && !passwordHash) throw new ApiError('กรุณากำหนดรหัสผ่านสำหรับบัญชีใหม่อย่างน้อย 12 ตัวอักษร');
    if (target) {
      await tx.user.update({ where: { id: target.id }, data: { role, name, active, ...(passwordHash ? { passwordHash } : {}) } });
      if (passwordHash || !active || role !== target.role) await tx.session.deleteMany({ where: { userId: target.id } });
    } else await tx.user.create({ data: { id: id(), email, name, role, active, passwordHash: passwordHash!, createdAt: now() } });
    await tx.invite.upsert({ where: { email }, create: { email, role, name, active }, update: { role, name, active } });
    await audit(tx, m, 'จัดการสิทธิ์ผู้ใช้', null, target, { email, role, name, active, passwordChanged: !!passwordHash });
    return { ok: true };
  }
  if (action === 'workflow') {
    allow(m, ['admin']);
    const chain = b.chain;
    if (!Array.isArray(chain) || !chain.length || chain.length > 3 || new Set(chain).size !== chain.length || chain.some(x => !['head', 'deputy', 'dean'].includes(x))) throw new ApiError('สายอนุมัติไม่ถูกต้อง');
    await tx.setting.upsert({ where: { key: 'workflow' }, create: { key: 'workflow', value: json(chain) }, update: { value: json(chain) } });
    await audit(tx, m, 'กำหนดสายอนุมัติ', null, null, chain);
    return { ok: true };
  }
  if (action === 'create' || action === 'import') {
    allow(m, ['staff', 'admin']);
    const a = validated(b.asset), reason = clean(b.reason ?? '');
    let sourceId: string | null = null, sourceRow: string | null = null, raw: unknown = null;
    if (action === 'import') {
      sourceId = clean(b.sourceId); sourceRow = clean(b.sourceRow);
      const src = await getSource(sourceId), row = classify(src).find(x => x.key === sourceRow);
      if (!row || row.kind !== 'asset') throw new ApiError('เลือกแถวรายการครุภัณฑ์');
      if (!b.reviewed) throw new ApiError('กรุณาตรวจสอบข้อมูลก่อนนำเข้า');
      if (row.groupName && !String(a.groupName).includes(row.groupName)) throw new ApiError('ต้องเก็บข้อความชุด / โครงการต้นฉบับไว้ในหมวด');
      raw = row;
    }
    if (BigInt(a.unitSatang!) * BigInt(a.quantity!) !== BigInt(a.totalSatang!) && !reason) throw new ApiError('ยอดเงินไม่ตรงสูตร กรุณาระบุเหตุผลที่ใช้ยอดนี้');
    const range = expandRange(a.code!, a.quantity!);
    if (a.code!.includes('ถึง') && !range) throw new ApiError('กรุณายืนยันหมายเลขครุภัณฑ์ที่ชัดเจนก่อนนำเข้า เก็บรหัสช่วงเดิมในหมายเหตุ');
    const base = { ...a, id: id(), lifecycle: range ? 'split' : 'active', version: 1, parentId: null, sourceId, sourceRow, createdAt: now() } as Asset;
    await dimensions(tx, base); await insertAsset(tx, base);
    if (sourceId && sourceRow) await tx.sourceRow.create({ data: { id: id(), sourceId, sourceRow, raw: json(raw), decision: 'imported', reason, actor: m.id, createdAt: now() } });
    if (range) {
      const amounts = split(base.quantity, base.totalSatang, 1), salvage = split(base.quantity, base.salvageSatang, 1);
      for (const [i, code] of range.entries()) await insertAsset(tx, { ...base, id: id(), code, quantity: 1, totalSatang: amounts[i], salvageSatang: salvage[i], lifecycle: 'active', parentId: base.id });
    }
    await audit(tx, m, sourceId ? 'นำเข้าครุภัณฑ์' : 'เพิ่มครุภัณฑ์', base.id, null, base, reason);
    return { ok: true, id: base.id };
  }
  if (action === 'batchImport') {
    allow(m, ['staff', 'admin']);
    const sourceId = clean(b.sourceId);
    const src = await getSource(sourceId);
    const allRows = classify(src);
    const rowMap = new Map(allRows.map(x => [x.key, x]));
    const existingDecisions = await tx.sourceRow.findMany({ where: { sourceId }, select: { sourceRow: true } });
    const doneKeys = new Set(existingDecisions.map(x => x.sourceRow));

    let keys: string[] = Array.isArray(b.keys) ? b.keys.filter((k: unknown) => typeof k === 'string').map((k: string) => clean(k)) : [];
    if (b.allReady) {
      keys = allRows.filter(r => r.kind === 'asset' && !r.issue && !doneKeys.has(r.key)).map(r => r.key);
    }
    keys = keys.filter(k => !doneKeys.has(k));
    if (!keys.length) throw new ApiError('ไม่มีรายการที่พร้อมนำเข้า หรือถูกนำเข้าหมดแล้ว');

    // Pre-insert unique dimensions in bulk
    const locs = new Set<string>(['ไม่ระบุสถานที่']);
    const branches = new Set<string>(['สำนักงานคณบดี']);
    const cats = new Set<string>(['ครุภัณฑ์ทั่วไป']);
    const groups = new Map<string, string>([['ทั่วไป', 'ครุภัณฑ์ทั่วไป']]);
    for (const key of keys) {
      const row = rowMap.get(key);
      if (!row || row.kind !== 'asset') continue;
      const c = row.asset;
      const loc = clean(c.location || '') || 'ไม่ระบุสถานที่';
      const br = clean(c.branch || '') || 'สำนักงานคณบดี';
      const cat = clean(c.category || ('ครุภัณฑ์' + row.sheet)) || 'ครุภัณฑ์ทั่วไป';
      const grp = clean(c.groupName || '') || 'ทั่วไป';
      locs.add(loc);
      branches.add(br);
      cats.add(cat);
      groups.set(grp, grp);
    }
    await tx.location.createMany({ data: Array.from(locs).map(name => ({ name })), skipDuplicates: true });
    await tx.branch.createMany({ data: Array.from(branches).map(name => ({ name })), skipDuplicates: true });
    await tx.category.createMany({ data: Array.from(cats).map(name => ({ name })), skipDuplicates: true });
    await tx.assetGroup.createMany({ data: Array.from(groups).map(([name, description]) => ({ name, description })), skipDuplicates: true });

    // Track existing codes to avoid unique constraint violations
    const candidateCodes = keys.map(k => rowMap.get(k)?.asset?.code).filter(Boolean) as string[];
    const existingAssets = await tx.asset.findMany({
      where: { code: { in: candidateCodes } },
      select: { code: true }
    });
    const existingAssetCodes = new Set(existingAssets.map(a => a.code));
    const seenCodesInBatch = new Set<string>();

    let importedCount = 0;
    const reason = clean(b.reason ?? 'นำเข้าแบบกลุ่ม (Batch Import)');
    const assetsToInsert: Prisma.AssetCreateManyInput[] = [];
    const sourceRowsToInsert: Prisma.SourceRowCreateManyInput[] = [];

    for (const key of keys) {
      const row = rowMap.get(key);
      if (!row || row.kind !== 'asset') continue;
      const cand = row.asset;
      let code = clean(cand.code || '');
      const name = clean(cand.name || '');
      const quantity = Math.max(1, cand.quantity || 1);
      const unitSatang = cand.unitSatang || 0;
      const totalSatang = cand.totalSatang || (unitSatang * quantity);
      if (!code || !name) continue;

      if (existingAssetCodes.has(code) || seenCodesInBatch.has(code)) {
        code = `${code} (ซ้ำ-${row.sheet}:${row.row})`;
      }
      seenCodesInBatch.add(code);

      const range = expandRange(code, quantity);
      const base: Asset = {
        id: id(),
        code,
        name,
        quantity,
        unitSatang,
        totalSatang,
        notes: clean(cand.notes || ''),
        location: clean(cand.location || '') || 'ไม่ระบุสถานที่',
        branch: clean(cand.branch || '') || 'สำนักงานคณบดี',
        groupName: clean(cand.groupName || '') || 'ทั่วไป',
        category: clean(cand.category || ('ครุภัณฑ์' + row.sheet)) || 'ครุภัณฑ์ทั่วไป',
        condition: cand.condition || 'normal',
        lifecycle: range ? 'split' : 'active',
        version: 1,
        parentId: null,
        sourceId,
        sourceRow: key,
        receivedDate: cand.receivedDate || '',
        lifeYears: cand.lifeYears || 0,
        salvageSatang: cand.salvageSatang || 0,
        serial: clean(cand.serial || ''),
        brand: clean(cand.brand || ''),
        custodian: clean(cand.custodian || ''),
        createdAt: now()
      };

      assetsToInsert.push(financialData(base) as Prisma.AssetCreateManyInput);
      sourceRowsToInsert.push({
        id: id(),
        sourceId,
        sourceRow: key,
        raw: json(row),
        decision: 'imported',
        reason,
        actor: m.id,
        createdAt: now()
      });

      if (range) {
        const amounts = split(base.quantity, base.totalSatang, 1);
        const salvage = split(base.quantity, base.salvageSatang, 1);
        for (const [i, rcode] of range.entries()) {
          let childCode = rcode;
          if (existingAssetCodes.has(childCode) || seenCodesInBatch.has(childCode)) {
            childCode = `${rcode} (ซ้ำ-${row.sheet}:${row.row})`;
          }
          seenCodesInBatch.add(childCode);
          assetsToInsert.push(financialData({
            ...base,
            id: id(),
            code: childCode,
            quantity: 1,
            totalSatang: amounts[i],
            salvageSatang: salvage[i],
            lifecycle: 'active',
            parentId: base.id
          }) as Prisma.AssetCreateManyInput);
        }
      }
      importedCount++;
    }

    if (assetsToInsert.length) {
      await tx.asset.createMany({ data: assetsToInsert, skipDuplicates: true });
    }
    if (sourceRowsToInsert.length) {
      await tx.sourceRow.createMany({ data: sourceRowsToInsert, skipDuplicates: true });
    }

    await audit(tx, m, 'นำเข้าครุภัณฑ์แบบกลุ่ม', null, null, { sourceId, count: importedCount, requested: keys.length }, `นำเข้าพร้อมกัน ${importedCount} รายการ`);
    return { ok: true, count: importedCount, importedCount };
  }
  if (['edit', 'split', 'request', 'repairComplete'].includes(action)) {
    allow(m, ['staff', 'admin']);
    const a = await asset(tx, clean(b.id));
    if (a.lifecycle !== 'active') throw new ApiError('รายการนี้ถูกแบ่งยอดหรือปิดบัญชีแล้ว');
    if (a.version !== b.version) throw new ApiError('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
    if (await tx.assetRequest.findFirst({ where: { assetId: a.id, status: 'pending' } })) throw new ApiError('รายการนี้มีคำขอรออนุมัติ กรุณาดำเนินการคำขอให้เสร็จก่อน');
    const reason = clean(b.reason ?? '');
    if (action === 'edit') {
      const next = validated(b.asset);
      if (next.condition !== a.condition && (next.condition === 'repair' || a.condition === 'repair')) throw new ApiError('การเข้า/ออกสถานะซ่อมต้องใช้คำขอซ่อมหรือบันทึกซ่อมเสร็จ');
      if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแก้ไข');
      if (next.quantity !== a.quantity || next.totalSatang !== a.totalSatang || next.unitSatang !== a.unitSatang) throw new ApiError('จำนวนและมูลค่าที่ลงทะเบียนแล้วแก้ตรงนี้ไม่ได้ ใช้แบ่งล็อตพร้อมหลักฐาน');
      await dimensions(tx, next);
      await tx.asset.update({ where: { id: a.id }, data: { ...financialData(next), version: { increment: 1 } } });
      await audit(tx, m, 'แก้ไขครุภัณฑ์', a.id, a, next, reason);
    }
    if (action === 'split') {
      if (a.condition === 'repair') throw new ApiError('กรุณาบันทึกผลการซ่อมก่อนแบ่งล็อต');
      if (!reason) throw new ApiError('กรุณาระบุเหตุผลการแบ่งล็อต');
      const take = Number(b.quantity), amounts = split(a.quantity, a.totalSatang, take), salvage = split(a.quantity, a.salvageSatang, take), condition = clean(b.condition);
      if (!Object.hasOwn(conditions, condition) || condition === 'repair') throw new ApiError('สถานะไม่ถูกต้อง');
      const children = [
        { ...a, id: id(), parentId: a.id, code: a.code + ' / 1-' + a.version, quantity: take, totalSatang: amounts[0], salvageSatang: salvage[0], condition, version: 1, createdAt: now() },
        { ...a, id: id(), parentId: a.id, code: a.code + ' / 2-' + a.version, quantity: a.quantity - take, totalSatang: amounts[1], salvageSatang: salvage[1], version: 1, createdAt: now() },
      ];
      await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'split', version: { increment: 1 } } });
      for (const child of children) await insertAsset(tx, child);
      await audit(tx, m, 'แบ่งล็อต', a.id, a, children, reason);
    }
    if (action === 'request') {
      const kind = clean(b.kind);
      if (!Object.hasOwn(requestTypes, kind) || !reason) throw new ApiError('ระบุประเภทและเหตุผลของคำขอ');
      const payload: Input = kind === 'transfer' ? { location: clean(b.payload?.location ?? ''), branch: clean(b.payload?.branch ?? '') } : {};
      if (kind === 'transfer' && (!payload.location || !payload.branch)) throw new ApiError('ระบุสถานที่และสาขาปลายทาง');
      const config = await tx.setting.findUnique({ where: { key: 'workflow' } }), chain = config?.value || '["head","deputy","dean"]';
      const req = await tx.assetRequest.create({ data: { id: id(), assetId: a.id, assetVersion: a.version + 1, kind, payload: json(payload), reason, chain, actor: m.id, createdAt: now() } });
      await tx.asset.update({ where: { id: a.id }, data: { version: { increment: 1 } } });
      await audit(tx, m, 'ส่งคำขอ ' + requestTypes[kind as keyof typeof requestTypes], a.id, a, req, reason);
    }
    if (action === 'repairComplete') {
      if (a.condition !== 'repair' || !reason) throw new ApiError('เลือกรายการที่กำลังซ่อม และระบุผลการซ่อม');
      const cost = Number(b.costSatang);
      if (!Number.isSafeInteger(cost) || cost < 0 || cost > 100000000000000) throw new ApiError('ค่าซ่อมไม่ถูกต้อง');
      await tx.asset.update({ where: { id: a.id }, data: { condition: 'normal', version: { increment: 1 } } });
      await audit(tx, m, 'ซ่อมเสร็จ', a.id, a, { condition: 'normal', costSatang: cost }, reason);
    }
    return { ok: true };
  }
  if (action === 'approve' || action === 'reject') {
    const r = await tx.assetRequest.findUnique({ where: { id: clean(b.id) } });
    if (!r || r.status !== 'pending' || r.version !== b.version) throw new ApiError('คำขอเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
    const chain = JSON.parse(r.chain); allow(m, [chain[r.stage]]);
    if (r.actor === m.id) throw new ApiError('ไม่สามารถอนุมัติคำขอตนเอง');
    const a = await asset(tx, r.assetId);
    if (a.version !== r.assetVersion || a.lifecycle !== 'active') throw new ApiError('ข้อมูลครุภัณฑ์เปลี่ยนแล้ว คำขอเดิมใช้ไม่ได้', 409);
    const note = clean(b.reason ?? '');
    if (action === 'reject' && !note) throw new ApiError('กรุณาระบุเหตุผลส่งกลับ');
    const final = action === 'approve' && r.stage === chain.length - 1;
    await tx.approval.create({ data: { id: id(), requestId: r.id, stage: r.stage, decision: action, actor: m.id, note, createdAt: now() } });
    await tx.assetRequest.update({ where: { id: r.id }, data: { stage: r.stage + (action === 'approve' ? 1 : 0), status: action === 'reject' ? 'rejected' : final ? 'approved' : 'pending', version: { increment: 1 } } });
    await audit(tx, m, action === 'reject' ? 'ส่งคำขอกลับ' : 'อนุมัติคำขอ', a.id, r, { stage: r.stage + 1, final }, note);
    if (final) {
      const payload = JSON.parse(r.payload);
      if (r.kind === 'transfer') {
        const location = clean(payload.location), branch = clean(payload.branch);
        await tx.location.createMany({ data: [{ name: location }], skipDuplicates: true });
        await tx.branch.createMany({ data: [{ name: branch }], skipDuplicates: true });
        await tx.asset.update({ where: { id: a.id }, data: { location, branch, version: { increment: 1 } } });
      }
      if (r.kind === 'repair') await tx.asset.update({ where: { id: a.id }, data: { condition: 'repair', version: { increment: 1 } } });
      if (r.kind === 'disposal') await tx.asset.update({ where: { id: a.id }, data: { lifecycle: 'disposed', version: { increment: 1 } } });
      await audit(tx, m, 'ดำเนินการ ' + requestTypes[r.kind as keyof typeof requestTypes], a.id, a, { ...payload, kind: r.kind }, r.reason);
    }
    return { ok: true };
  }
  if (action === 'round') {
    allow(m, ['staff', 'admin']);
    const name = clean(b.name, 200), year = Number(b.year);
    if (!name || !Number.isInteger(year) || year < 2500 || year > 2800) throw new ApiError('ชื่อรอบหรือปีงบประมาณไม่ถูกต้อง');
    const assets = await tx.asset.findMany({ where: { lifecycle: 'active' } });
    if (!assets.length) throw new ApiError('ยังไม่มีทะเบียนครุภัณฑ์สำหรับตรวจนับ');
    const rid = id();
    await tx.stocktake.create({ data: { id: rid, name, year, createdAt: now() } });
    await tx.stocktakeItem.createMany({ data: assets.map(a => ({ id: rid + a.id, roundId: rid, assetId: a.id, snapshot: json({ code: a.code, name: a.name, quantity: a.quantity, location: a.location, branch: a.branch, totalSatang: a.totalSatang }) })) });
    await audit(tx, m, 'เปิดรอบตรวจนับ', null, null, { id: rid, name, year });
    return { ok: true, id: rid };
  }
  if (action === 'check') {
    allow(m, ['staff', 'admin']);
    const result = clean(b.result);
    if (!['normal', 'damaged', 'missing', 'mismatch'].includes(result)) throw new ApiError('ผลตรวจไม่ถูกต้อง');
    const item = await tx.stocktakeItem.findUnique({ where: { id: clean(b.id) }, include: { round: true } });
    if (!item || item.round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรายการ');
    const quantity = Number(b.quantity), expected = JSON.parse(item.snapshot).quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > expected) throw new ApiError('จำนวนที่พบต้องอยู่ระหว่าง 0 ถึงจำนวนตามทะเบียน');
    if (result === 'normal' && quantity !== expected) throw new ApiError('จำนวนไม่ตรงทะเบียน กรุณาเลือกข้อมูลไม่ตรง');
    if (result === 'missing' && quantity !== 0) throw new ApiError('ผลไม่พบต้องมีจำนวนที่พบเป็น 0');
    await tx.stocktakeItem.update({ where: { id: item.id }, data: { result, quantity, notes: clean(b.reason ?? ''), actor: m.id, checkedAt: now() } });
    await audit(tx, m, 'บันทึกตรวจนับ', item.assetId, item, { result, quantity }, clean(b.reason ?? ''));
    return { ok: true };
  }
  if (action === 'closeRound') {
    allow(m, ['staff', 'admin']);
    const rid = clean(b.id), round = await tx.stocktake.findUnique({ where: { id: rid } });
    if (!round || round.status !== 'open') throw new ApiError('รอบตรวจนับปิดแล้ว หรือไม่พบรอบ', 409);
    const remaining = await tx.stocktakeItem.count({ where: { roundId: rid, result: 'pending' } });
    if (remaining) throw new ApiError('ยังมีรายการไม่ได้ตรวจนับ ' + remaining + ' รายการ');
    await tx.stocktake.update({ where: { id: rid }, data: { status: 'closed', closedAt: now() } });
    await audit(tx, m, 'ปิดรอบตรวจนับ', null, null, { id: rid });
    return { ok: true };
  }
  throw new ApiError('ไม่พบการทำงานนี้', 404);
}
