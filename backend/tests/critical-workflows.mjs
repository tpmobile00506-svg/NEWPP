import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { splitAmounts, expandRange, classify, satang, bookValue, headers11 } from '../contracts/domain.ts';

// Run only against a separately seeded local test database/server. Never load .env here.
const base = new URL(process.env.ASSET_TEST_URL || 'http://localhost:5174');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'ASSET_TEST_URL must be a loopback test server, never a deployed application');
assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password, 'Invalid test server URL');

assert.deepEqual(splitAmounts(400, 37000000, 189), [17482500, 19517500]);
for (const n of [0, 400, 401, -1, 1.2]) assert.throws(() => splitAmounts(400, 37000000, n));
assert.deepEqual(splitAmounts(3, 100, 1), [33, 67]);
assert.deepEqual(expandRange('4354-4331-071-213-1(2)ถึง-2(2)', 2), ['4354-4331-071-213-1(2)', '4354-4331-071-213-2(2)']);
assert.equal(expandRange('a-1(20) ถึง 20(20)', 2), null);
assert.equal(satang('1,925.75'), 192575);
assert.throws(() => satang('1.001'));
assert.equal(headers11.length, 11);
const source = JSON.parse(fs.readFileSync(new URL('../data/provided.json', import.meta.url), 'utf8'));
const rows = classify(source);
assert.equal(rows.length, 4312);
assert.equal(rows.find(x => x.key === 'สำนักงาน:50').asset.totalSatang, 37000000);
for (const key of ['คอม:32', 'คอม:33']) {
  const row = rows.find(x => x.key === key);
  assert.equal(row.kind, 'asset');
  assert.match(row.groupName, /NonLinear/);
  assert.match(row.groupName, /160500/);
  assert.ok(row.issue);
}
assert.match(rows.find(x => x.key === 'คอม:36').groupName, /มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน/);
assert.equal(rows.find(x => x.key === 'สำนักงาน:1080').kind, 'asset');
assert.equal(bookValue({ receivedDate: '2020-01-01', lifeYears: 5, salvageSatang: 100, totalSatang: 10000 }, new Date('2030-01-01')), 100);
console.log('PASS domain: exact money, split rounding, code ranges, 11 columns, 4,312 source rows, set headings, depreciation floor');
if (process.argv.includes('--domain-only')) process.exit(0);

const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
assert.ok(adminEmail && adminPassword, 'Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for the isolated test seed; production .env credentials are not used');
const suffix = Date.now().toString(36) + '-' + randomUUID().slice(0, 8);
const initialPassword = 'Local-test-' + randomUUID();
const resetPassword = 'Reset-test-' + randomUUID();
const identities = { admin: { email: adminEmail, password: adminPassword } };
for (const role of ['staff', 'head', 'deputy', 'dean']) identities[role] = { email: `${role}-${suffix}@example.test`, password: initialPassword };
const cookies = {};
const secretValues = [adminPassword, initialPassword, resetPassword];

function noCredentials(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!['password', 'passwordHash', 'tokenHash', 'sessionToken'].includes(key), `Private field exposed: ${key}`);
    if (typeof item === 'string') {
      assert.ok(!item.includes('scrypt:'), 'Password hash exposed in response or audit');
      for (const secret of secretValues) assert.ok(!item.includes(secret), 'Password exposed in response or audit');
      if (/^\s*[\[{]/.test(item)) {
        let nested;
        try { nested = JSON.parse(item); } catch { /* Regular text may start with a bracket. */ }
        if (nested) noCredentials(nested);
      }
    } else noCredentials(item);
  }
}
async function responseData(response) {
  let data;
  try { data = await response.json(); }
  catch { assert.fail(`Expected JSON, received HTTP ${response.status}`); }
  noCredentials(data);
  return { status: response.status, data, response };
}
async function call(role, body, path = '') {
  const response = await fetch(new URL('/api/data' + path, base), {
    method: body ? 'POST' : 'GET',
    headers: { ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: base.origin } : {}) },
    body: body ? JSON.stringify({ token: randomUUID(), ...body }) : undefined,
  });
  return responseData(response);
}
function good(result) {
  assert.equal(result.status, 200, `Expected success; received HTTP ${result.status}: ${result.data.error || 'unexpected response'}`);
  return result.data;
}
async function login(role, password = identities[role].password) {
  const result = await responseData(await fetch(new URL('/api/auth/login', base), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.origin },
    body: JSON.stringify({ email: identities[role].email, password }),
  }));
  if (result.status === 200) {
    const cookie = result.response.headers.get('set-cookie');
    assert.match(cookie || '', /^ksu_session=[a-f0-9]{64};/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    cookies[role] = cookie.split(';', 1)[0];
  }
  return result;
}
async function approveRequest(requestId) {
  for (const role of ['head', 'deputy', 'dean']) {
    const request = good(await call(role)).requests.find(x => x.id === requestId);
    good(await call(role, { action: 'approve', id: request.id, version: request.version, reason: 'เห็นชอบในการทดสอบ' }));
  }
}

assert.equal((await fetch(new URL('/api/data', base))).status, 401);
assert.equal((await fetch(new URL('/api/source?source=provided-2569', base))).status, 401);
assert.equal((await fetch(new URL('/api/data', base), { headers: { 'oai-authenticated-user-id': 'forged-admin', 'oai-authenticated-user-email': adminEmail } })).status, 401);
good(await login('admin'));
assert.equal(good(await call('admin')).me.role, 'admin');
for (const role of ['staff', 'head', 'deputy', 'dean']) {
  good(await call('admin', { action: 'user', email: identities[role].email, name: `${role} ${suffix}`, role, active: true, password: initialPassword }));
  good(await login(role));
  assert.equal(good(await call(role)).me.role, role);
}
assert.equal((await call('admin', { action: 'user', email: `bad-role-${suffix}@example.test`, name: 'Invalid', role: 'toString', password: initialPassword })).status, 400);
assert.equal((await call('admin', { action: 'user', email: `no-password-${suffix}@example.test`, name: 'Invalid', role: 'staff' })).status, 400);
assert.equal((await call('admin', { action: 'user', email: `short-password-${suffix}@example.test`, name: 'Invalid', role: 'staff', password: 'too-short' })).status, 400);
assert.equal((await call('staff', { action: 'workflow', chain: ['head'] })).status, 403);
good(await call('admin', { action: 'workflow', chain: ['head', 'deputy', 'dean'] }));

for (const route of ['/api/data', '/api/auth/login']) {
  const result = await responseData(await fetch(new URL(route, base), { method: 'POST', headers: { Cookie: cookies.staff, 'Content-Type': 'application/json', Origin: base.origin }, body: '{' }));
  assert.equal(result.status, 400, `Malformed JSON must be rejected by ${route}`);
}
for (const route of ['/api/data', '/api/auth/login', '/api/auth/logout']) {
  const result = await responseData(await fetch(new URL(route, base), {
    method: 'POST', headers: { Cookie: cookies.staff, 'Content-Type': 'application/json', Origin: 'https://localhost.evil.example', 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify(route.includes('login') ? identities.staff : { action: 'workflow', chain: ['head'] }),
  }));
  assert.equal(result.status, 403, `Cross-origin request must be rejected by ${route}`);
}
good(await call('staff'));
console.log('PASS authentication: real cookies, five roles, no forged identity headers, malformed JSON, cross-origin rejection');

const proto = { code: 'CHAIR-' + suffix, name: 'เก้าอี้ทดสอบ', quantity: 400, unitSatang: 92500, totalSatang: 37000000, location: 'ห้องทดสอบ', branch: 'ทดสอบ', category: 'ครุภัณฑ์สำนักงาน', condition: 'normal', groupName: 'ชุดทดสอบ ' + suffix, notes: '', receivedDate: '', lifeYears: 0, salvageSatang: 0 };
const parent = good(await call('staff', { action: 'create', asset: proto })).id;
let state = good(await call('staff'));
let asset = state.assets.find(x => x.id === parent);
assert.equal(typeof asset.totalSatang, 'number', 'PostgreSQL BIGINT must be serialized as safe JSON number');
assert.equal((await call('staff', { action: 'edit', id: parent, version: asset.version, asset: { ...asset, location: 'ย้ายข้ามอนุมัติ' }, reason: 'bad' })).status, 400);
assert.equal((await call('staff', { action: 'create', asset: { ...proto, code: 'INVALID-' + suffix, receivedDate: '2026-02-31' } })).status, 400);
assert.equal((await call('head', { action: 'create', asset: { ...proto, code: 'FORBIDDEN-' + suffix } })).status, 403);
const body = { action: 'split', id: parent, version: asset.version, quantity: 189, condition: 'damaged', reason: 'ตรวจพบชำรุด', token: 'split-' + suffix };
const identical = await Promise.all([call('staff', body), call('staff', body)]);
identical.forEach(good);
assert.equal(good(await call('staff', body)).replayed, true);
assert.equal((await call('staff', { ...body, quantity: 188 })).status, 409);
state = good(await call('staff'));
const children = state.assets.filter(x => x.parentId === parent);
assert.equal(children.length, 2);
assert.equal(children.reduce((n, x) => n + x.quantity, 0), 400);
assert.equal(children.reduce((n, x) => n + x.totalSatang, 0), 37000000);
assert.equal(children.find(x => x.condition === 'damaged').totalSatang, 17482500);
assert.equal(children.find(x => x.condition === 'normal').totalSatang, 19517500);
assert.equal(state.assets.find(x => x.id === parent).lifecycle, 'split');
const history = good(await call('staff', null, '?view=history&asset=' + parent));
assert.equal(history.children.length, 2);
assert.ok(history.events.length >= 2);
asset = children.find(x => x.condition === 'normal');
const concurrent = await Promise.all([
  call('staff', { action: 'split', id: asset.id, version: asset.version, quantity: 10, condition: 'damaged', reason: 'race1' }),
  call('staff', { action: 'split', id: asset.id, version: asset.version, quantity: 20, condition: 'damaged', reason: 'race2' }),
]);
assert.equal(concurrent.filter(x => x.status === 200).length, 1, 'Only one competing split may commit');
assert.ok(concurrent.some(x => [400, 409].includes(x.status)), 'Competing split must fail cleanly as stale or inactive');
state = good(await call('staff'));
const grandchildren = state.assets.filter(x => x.parentId === asset.id);
assert.equal(grandchildren.length, 2);
assert.equal(grandchildren.reduce((n, x) => n + x.quantity, 0), 211);
assert.equal(grandchildren.reduce((n, x) => n + x.totalSatang, 0), 19517500);

const range = good(await call('staff', { action: 'create', asset: { ...proto, code: 'AIR-' + suffix + '-1(2)ถึง-2(2)', quantity: 2, unitSatang: 100, totalSatang: 200 } }));
state = good(await call('staff'));
const units = state.assets.filter(x => x.parentId === range.id);
assert.equal(units.length, 2);
assert.notEqual(units[0].id, units[1].id, 'Independent QR identifiers');
assert.notEqual(units[0].code, units[1].code);
good(await call('staff', { action: 'edit', id: units[0].id, version: units[0].version, asset: { ...units[0], condition: 'damaged' }, reason: 'เครื่องแรกชำรุด' }));
assert.equal((await call('staff', { action: 'edit', id: units[0].id, version: units[0].version, asset: units[0], reason: 'stale edit' })).status, 409);
state = good(await call('staff'));
assert.equal(state.assets.find(x => x.id === units[1].id).condition, 'normal');
asset = state.assets.find(x => x.id === units[1].id);
assert.equal((await call('staff', { action: 'edit', id: asset.id, version: asset.version, asset: { ...asset, condition: 'repair' }, reason: 'ข้ามคำขอซ่อม' })).status, 400);
good(await call('staff', { action: 'request', id: asset.id, version: asset.version, kind: 'transfer', payload: { location: 'ปลายทาง', branch: 'สาขาใหม่' }, reason: 'ขอโอนย้าย' }));
let request = good(await call('head')).requests.find(x => x.assetId === asset.id && x.status === 'pending');
assert.equal((await call('admin', { action: 'approve', id: request.id, version: request.version })).status, 403);
assert.equal((await call('dean', { action: 'approve', id: request.id, version: request.version })).status, 403);
await approveRequest(request.id);
state = good(await call('staff'));
asset = state.assets.find(x => x.id === asset.id);
assert.equal(asset.location, 'ปลายทาง');
assert.equal(state.requests.find(x => x.id === request.id).status, 'approved');
good(await call('staff', { action: 'request', id: asset.id, version: asset.version, kind: 'repair', reason: 'ส่งซ่อม' }));
request = good(await call('head')).requests.find(x => x.assetId === asset.id && x.status === 'pending');
await approveRequest(request.id);
asset = good(await call('staff')).assets.find(x => x.id === asset.id);
assert.equal(asset.condition, 'repair');
good(await call('staff', { action: 'repairComplete', id: asset.id, version: asset.version, costSatang: 12550, reason: 'เปลี่ยนอะไหล่' }));
asset = good(await call('staff')).assets.find(x => x.id === asset.id);
assert.equal(asset.condition, 'normal');
good(await call('staff', { action: 'request', id: asset.id, version: asset.version, kind: 'disposal', reason: 'ขอจำหน่าย' }));
request = good(await call('head')).requests.find(x => x.assetId === asset.id && x.status === 'pending');
await approveRequest(request.id);
asset = good(await call('staff')).assets.find(x => x.id === asset.id);
assert.equal(asset.lifecycle, 'disposed', 'Disposal must preserve the record');
console.log('PASS assets: BIGINT JSON, exact split, parallel replay, competing split, stale updates, independent units, transfer/repair/disposal approvals');

const round = good(await call('staff', { action: 'round', name: 'รอบทดสอบ ' + suffix, year: 2569 }));
assert.equal((await call('staff', { action: 'closeRound', id: round.id })).status, 400);
const items = good(await call('staff', null, '?view=stocktake&round=' + round.id)).items;
assert.ok(items.length > 0);
assert.ok(!items.some(item => item.assetId === asset.id), 'Disposed asset must not enter a new round');
for (const item of items) good(await call('staff', { action: 'check', id: item.id, result: 'normal', quantity: JSON.parse(item.snapshot).quantity, reason: 'ตรวจจริง' }));
good(await call('staff', { action: 'closeRound', id: round.id }));
assert.equal((await call('staff', { action: 'check', id: items[0].id, result: 'normal', quantity: 1 })).status, 400);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('สำนักงาน');
sheet.addRow(['ลำดับ', 'หมายเลขครุภัณฑ์', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'จำนวนเงิน', 'หมายเหตุ']);
sheet.addRow([1, 'UPLOAD-' + suffix, 'ทดสอบต้นฉบับ', 1, 250, 250, 'ห้องทดสอบ']);
const workbookBytes = Buffer.from(await workbook.xlsx.writeBuffer());
const form = new FormData();
form.set('file', new File([workbookBytes], 'test-' + suffix + '.xlsx'));
form.set('source', JSON.stringify({ sheets: [{ name: 'forged', rows: [] }] }));
const upload = good(await responseData(await fetch(new URL('/api/data', base), { method: 'POST', headers: { Cookie: cookies.staff, Origin: base.origin }, body: form })));
const parsed = good(await call('staff', null, '?view=source&source=' + upload.id));
assert.equal(parsed.rows.find(x => x.kind === 'asset').asset.totalSatang, 25000);
assert.equal(parsed.sheets[0], 'สำนักงาน');
const download = await fetch(new URL('/api/source?source=' + upload.id, base), { headers: { Cookie: cookies.staff } });
assert.equal(download.status, 200);
assert.deepEqual(Buffer.from(await download.arrayBuffer()), workbookBytes, 'Uploaded original must be preserved byte-for-byte');
const original = await fetch(new URL('/api/source?source=provided-2569', base), { headers: { Cookie: cookies.staff } });
assert.equal(original.status, 200);
assert.equal(createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'), source.hash);
console.log('PASS stocktake/import: closed-round checks, active inventory, server XLSX parsing, byte-for-byte original preservation');

const oldCookie = cookies.staff;
good(await call('admin', { action: 'user', email: identities.staff.email, name: 'Reset ' + suffix, role: 'staff', active: true, password: resetPassword }));
assert.equal((await call('staff')).status, 401, 'Password reset must revoke existing session');
assert.equal((await login('staff', initialPassword)).status, 401);
good(await login('staff', resetPassword));
assert.notEqual(cookies.staff, oldCookie);
good(await call('admin', { action: 'user', email: identities.staff.email, name: 'Disabled ' + suffix, role: 'staff', active: false }));
assert.equal((await call('staff')).status, 401, 'Deactivation must revoke existing session');
assert.equal((await login('staff', resetPassword)).status, 401);
const logout = await responseData(await fetch(new URL('/api/auth/logout', base), { method: 'POST', headers: { Cookie: cookies.head, Origin: base.origin } }));
good(logout);
assert.match(logout.response.headers.get('set-cookie') || '', /Max-Age=0/);
assert.equal((await call('head')).status, 401, 'Logout must revoke the server-side session');
noCredentials(good(await call('admin')));
console.log('PASS sessions: password reset, deactivation, logout revocation; credentials absent from API and audit');
console.log('PASS all critical PostgreSQL/Prisma workflows on isolated local test server');
