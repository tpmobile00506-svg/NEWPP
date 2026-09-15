import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma, checkDatabase } from '../db/client';
import { hashPassword } from '../auth/sessions';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before db:seed');
try {
  await checkDatabase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'admin') throw new Error('ADMIN_EMAIL belongs to a non-admin account; seed will not change its role');
    console.log('Admin already exists; password and permissions were preserved.');
  } else {
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async tx => {
      if (await tx.user.count()) throw new Error('Database already has users; create administrators through the existing Admin account');
      const id = randomUUID();
      await tx.setting.create({ data: { key: 'bootstrap', value: id } });
      await tx.user.create({ data: { id, email, name: process.env.ADMIN_NAME || 'ผู้ดูแลระบบ', role: 'admin', active: 1, passwordHash, createdAt: new Date().toISOString() } });
    }, { isolationLevel: 'Serializable' });
    console.log('Initial Admin created. Credentials are in your local .env file.');
  }
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
