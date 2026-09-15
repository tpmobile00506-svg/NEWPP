import { prisma, type Transaction } from '../db/client';
import { ApiError } from '../services/errors';
function validate(key: string) {
  if (!/^imports\/[a-zA-Z0-9-]+(?:\.json)?$/.test(key)) throw new ApiError('ไม่พบไฟล์', 404);
}
export async function putFile(key: string, body: Uint8Array | string, tx: Transaction = prisma) {
  validate(key);
  await tx.storedFile.create({ data: { key, body: typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body) } });
}
export async function readFileBytes(key: string) {
  validate(key);
  const file = await prisma.storedFile.findUnique({ where: { key } });
  if (!file) throw new ApiError('ไม่พบไฟล์ต้นฉบับ กรุณาติดต่อผู้ดูแลระบบ', 404);
  return Buffer.from(file.body);
}
