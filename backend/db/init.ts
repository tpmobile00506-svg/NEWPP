import type { Pool } from 'pg';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "passwordHash" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "tokenHash" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX IF NOT EXISTS "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

CREATE TABLE IF NOT EXISTS "invites" (
  "email" TEXT PRIMARY KEY,
  "role" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "stored_files" (
  "key" TEXT PRIMARY KEY,
  "body" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "categories" ("name" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "branches" ("name" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "locations" ("name" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "asset_groups" ("name" TEXT PRIMARY KEY, "description" TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS "imports" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "hash" TEXT UNIQUE NOT NULL,
  "objectKey" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL,
  "actor" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "source_rows" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "sourceRow" TEXT NOT NULL,
  "raw" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "source_row_once" UNIQUE ("sourceId", "sourceRow")
);

CREATE TABLE IF NOT EXISTS "assets" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT UNIQUE NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitSatang" BIGINT NOT NULL,
  "totalSatang" BIGINT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "location" TEXT NOT NULL REFERENCES "locations"("name"),
  "branch" TEXT NOT NULL REFERENCES "branches"("name"),
  "category" TEXT NOT NULL REFERENCES "categories"("name"),
  "groupName" TEXT NOT NULL REFERENCES "asset_groups"("name"),
  "condition" TEXT NOT NULL DEFAULT 'normal',
  "lifecycle" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "parentId" TEXT,
  "sourceId" TEXT,
  "sourceRow" TEXT,
  "receivedDate" TEXT NOT NULL DEFAULT '',
  "lifeYears" INTEGER NOT NULL DEFAULT 0,
  "salvageSatang" BIGINT NOT NULL DEFAULT 0,
  "serial" TEXT NOT NULL DEFAULT '',
  "brand" TEXT NOT NULL DEFAULT '',
  "custodian" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "asset_lifecycle_branch" ON "assets"("lifecycle", "branch");
CREATE INDEX IF NOT EXISTS "asset_parent" ON "assets"("parentId");

CREATE TABLE IF NOT EXISTS "operations" (
  "id" TEXT PRIMARY KEY,
  "valid" INTEGER NOT NULL DEFAULT 1,
  "actor" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL DEFAULT '',
  "response" TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS "audit" (
  "id" TEXT PRIMARY KEY,
  "assetId" TEXT,
  "actor" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" TEXT NOT NULL,
  "after" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_asset" ON "audit"("assetId", "createdAt");

CREATE TABLE IF NOT EXISTS "requests" (
  "id" TEXT PRIMARY KEY,
  "assetId" TEXT NOT NULL REFERENCES "assets"("id"),
  "assetVersion" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "stage" INTEGER NOT NULL DEFAULT 0,
  "chain" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "version" INTEGER NOT NULL DEFAULT 1,
  "actor" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "request_status" ON "requests"("status");

CREATE TABLE IF NOT EXISTS "approvals" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "requests"("id"),
  "stage" INTEGER NOT NULL,
  "decision" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "approval_stage_once" UNIQUE ("requestId", "stage")
);

CREATE TABLE IF NOT EXISTS "stocktakes" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TEXT NOT NULL,
  "closedAt" TEXT
);

CREATE TABLE IF NOT EXISTS "stocktake_items" (
  "id" TEXT PRIMARY KEY,
  "roundId" TEXT NOT NULL REFERENCES "stocktakes"("id"),
  "assetId" TEXT NOT NULL REFERENCES "assets"("id"),
  "snapshot" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT 'pending',
  "quantity" INTEGER,
  "notes" TEXT NOT NULL DEFAULT '',
  "actor" TEXT,
  "checkedAt" TEXT,
  CONSTRAINT "stocktake_asset_once" UNIQUE ("roundId", "assetId")
);

INSERT INTO "categories" ("name") VALUES ('ครุภัณฑ์สำนักงาน'), ('ครุภัณฑ์คอมพิวเตอร์'), ('ครุภัณฑ์การศึกษา'), ('ครุภัณฑ์ยานพาหนะ'), ('ครุภัณฑ์ทั่วไป') ON CONFLICT DO NOTHING;
INSERT INTO "branches" ("name") VALUES ('สาขาวิชาวิศวกรรมคอมพิวเตอร์'), ('สาขาวิชาวิศวกรรมอุตสาหการ'), ('สำนักงานคณบดี') ON CONFLICT DO NOTHING;
INSERT INTO "locations" ("name") VALUES ('อาคาร 1 ชั้น 2'), ('อาคารปฏิบัติการรวม'), ('ห้องพักอาจารย์'), ('ไม่ระบุสถานที่') ON CONFLICT DO NOTHING;
INSERT INTO "asset_groups" ("name", "description") VALUES ('ทั่วไป', 'ครุภัณฑ์ทั่วไป') ON CONFLICT DO NOTHING;
`;

let isReady = false;
let initializingPromise: Promise<void> | null = null;

export async function ensureDatabaseReady(pool: Pool): Promise<void> {
  if (isReady) return;
  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    try {
      await pool.query(SCHEMA_SQL);
      isReady = true;
      console.log('Database schema verified / initialized successfully.');
    } catch (err) {
      console.error('Error verifying database schema:', err);
      throw err;
    } finally {
      initializingPromise = null;
    }
  })();

  return initializingPromise;
}
