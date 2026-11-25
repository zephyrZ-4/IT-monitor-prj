import { Pool, type PoolClient } from "pg";
import { randomBytes, scryptSync } from "node:crypto";

declare global {
  // eslint-disable-next-line no-var
  var clusterPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var clusterSchemaReady: Promise<void> | undefined;
}

export function pool(): Pool {
  if (!global.clusterPool) {
    if (process.env.DATABASE_URL) {
      global.clusterPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    } else if (process.env.DB_HOST && process.env.DB_PASSWORD) {
      global.clusterPool = new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || "cluster",
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || "cluster_monitor",
        max: 10,
      });
    } else {
      throw new Error("缺少数据库连接配置");
    }
  }
  return global.clusterPool;
}

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function createSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_batches (
      id BIGSERIAL PRIMARY KEY,
      digest TEXT NOT NULL UNIQUE,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      imported_by BIGINT REFERENCES admins(id),
      software_filename TEXT NOT NULL,
      usage_filename TEXT NOT NULL,
      rules_filename TEXT NOT NULL,
      report_generated_at TEXT NOT NULL,
      rules_generated_at TEXT NOT NULL,
      user_count INTEGER NOT NULL,
      usage_count INTEGER NOT NULL,
      rule_count INTEGER NOT NULL,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE IF NOT EXISTS user_snapshots (
      batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      account TEXT NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL,
      actual_user TEXT NOT NULL,
      source_data JSONB NOT NULL,
      PRIMARY KEY (batch_id, account)
    );
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      account TEXT NOT NULL,
      volume TEXT NOT NULL CHECK (volume IN ('home','data')),
      used_bytes BIGINT NOT NULL CHECK (used_bytes >= 0),
      hard_percent NUMERIC,
      shared BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (batch_id, account, volume)
    );
    CREATE TABLE IF NOT EXISTS quota_rules (
      batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      account TEXT NOT NULL,
      volume TEXT NOT NULL CHECK (volume IN ('home','data')),
      limit_bytes BIGINT NOT NULL CHECK (limit_bytes > 0),
      is_default BOOLEAN NOT NULL,
      PRIMARY KEY (batch_id, account, volume)
    );
    CREATE TABLE IF NOT EXISTS account_state (
      account TEXT PRIMARY KEY,
      missing_streak INTEGER NOT NULL DEFAULT 0,
      deleted BOOLEAN NOT NULL DEFAULT false,
      last_seen_batch BIGINT REFERENCES import_batches(id)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id UUID PRIMARY KEY,
      tracking_code TEXT NOT NULL UNIQUE,
      applicant_name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理','处理中','已处理','已驳回')),
      admin_note TEXT NOT NULL DEFAULT '',
      submitted_ip TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      handled_by BIGINT REFERENCES admins(id)
    );
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'cluster-resource';
    CREATE TABLE IF NOT EXISTS ticket_additional_applicants (
      ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 2),
      applicant_name TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      PRIMARY KEY (ticket_id, position),
      UNIQUE (ticket_id, employee_id)
    );
    CREATE TABLE IF NOT EXISTS ticket_items (
      id BIGSERIAL PRIMARY KEY,
      ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      account TEXT NOT NULL,
      field TEXT NOT NULL CHECK (field IN ('所属部门','状态','实际使用人','限额')),
      volume TEXT CHECK (volume IN ('home','data')),
      requested_value TEXT NOT NULL,
      reason TEXT NOT NULL,
      UNIQUE (ticket_id, position),
      CHECK ((field = '限额' AND volume IS NOT NULL) OR (field <> '限额' AND volume IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_account ON usage_snapshots(account, batch_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tickets_type_created ON tickets(ticket_type, created_at DESC);
  `);
  const exists = await client.query("SELECT 1 FROM admins LIMIT 1");
  if (!exists.rowCount) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 12) throw new Error("首次启动需要设置至少 12 位的 ADMIN_PASSWORD");
    await client.query("INSERT INTO admins (username, password_hash) VALUES ($1, $2)", [username, passwordHash(password)]);
  }
}

export async function ensureSchema(): Promise<void> {
  if (!global.clusterSchemaReady) {
    global.clusterSchemaReady = (async () => {
      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(8042411)");
        await createSchema(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      global.clusterSchemaReady = undefined;
      throw error;
    });
  }
  return global.clusterSchemaReady;
}
