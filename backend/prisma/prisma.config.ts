import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

export default defineConfig({
  schema: './schema.prisma',
  migrations: { path: './migrations', seed: 'tsx backend/prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL || 'postgresql://build:build@localhost:5432/build_only' },
});
