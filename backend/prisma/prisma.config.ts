import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: './schema.prisma',
  migrations: { path: './migrations', seed: 'tsx backend/prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL || 'postgresql://build:build@localhost:5432/build_only' },
});
