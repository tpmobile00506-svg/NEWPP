import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { settings } from '../config/env';
import { ApiError } from '../services/errors';
const cached = globalThis as unknown as { assetPrisma?: PrismaClient; assetPool?: pg.Pool };
export function getDatabaseUrl() { return settings.databaseUrl; }
export function getPool(): pg.Pool {
  if (cached.assetPool) return cached.assetPool;
  if (!settings.databaseUrl) throw new ApiError('ฐานข้อมูลยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลระบบ', 503);
  let connection: URL;
  try { connection = new URL(settings.databaseUrl); } catch { throw new ApiError('การตั้งค่าฐานข้อมูลไม่ถูกต้อง', 503); }
  if (!['postgres:', 'postgresql:'].includes(connection.protocol)) throw new ApiError('การตั้งค่าฐานข้อมูลไม่ถูกต้อง', 503);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname);
  if (!local) { connection.searchParams.set('sslmode', 'verify-full'); connection.searchParams.delete('uselibpqcompat'); }
  cached.assetPool = new pg.Pool({ connectionString: connection.href, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000 });
  cached.assetPrisma = new PrismaClient({ adapter: new PrismaPg(cached.assetPool) });
  return cached.assetPool;
}
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    getPool();
    const value = (cached.assetPrisma as any)[property];
    return typeof value === 'function' ? value.bind(cached.assetPrisma) : value;
  },
});
import { ensureDatabaseReady } from './init';

export async function checkDatabase() {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    await ensureDatabaseReady(pool);
  }
  catch (error) {
    console.error('Database unavailable', { code: (error as { code?: string }).code });
    throw new ApiError('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่ภายหลัง', 503);
  }
}
export type Transaction = Prisma.TransactionClient;
export { Prisma };
export function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item !== 'bigint') return item;
    const number = Number(item);
    if (!Number.isSafeInteger(number)) throw new Error('Database number is outside the safe integer range');
    return number;
  });
}
export function plain<T>(value: unknown): T { return JSON.parse(json(value)) as T; }
