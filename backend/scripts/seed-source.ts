import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '../db/client';
import { putFile } from '../storage/files';

try {
  const source = JSON.parse(await readFile(new URL('../data/provided.json', import.meta.url), 'utf8'));
  const original = JSON.parse(await readFile(new URL('../data/provided-original.json', import.meta.url), 'utf8'));
  const bytes = Buffer.from(original.base64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== source.hash) throw new Error('Source checksum mismatch');
  const raw = await readFile(new URL('../data/provided-raw.json', import.meta.url), 'utf8');
  const existing = await prisma.importFile.findUnique({ where: { id: source.id } });
  if (existing) {
    if (existing.hash !== source.hash) throw new Error('Registered source has a different checksum');
    console.log('Original source is already registered; preserved without overwriting.');
  } else {
    const key = 'imports/' + source.id;
    await prisma.$transaction(async tx => {
      await putFile(key, bytes, tx);
      await putFile(key + '.json', JSON.stringify(source), tx);
      await putFile(key + '-raw.json', raw, tx);
      await tx.importFile.create({ data: { id: source.id, name: source.name, hash: source.hash, objectKey: key, rowCount: source.sheets.reduce((n: number, s: any) => n + s.rows.length, 0), createdAt: new Date().toISOString(), actor: 'source-seed' } });
    }, { timeout: 20000 });
    console.log('Original workbook and all source rows stored privately in PostgreSQL; no assets auto-imported.');
  }
} finally { await prisma.$disconnect(); }
