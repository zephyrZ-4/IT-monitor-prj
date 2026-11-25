import { createHash } from "node:crypto";
import { ensureSchema, pool } from "@/lib/db";
import { parseImport } from "@/lib/import-parser";

export interface UploadFile {
  name: string;
  bytes: Buffer;
}

export class ImportFileError extends Error {}

function digest(files: UploadFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(String(file.bytes.length));
    hash.update(":");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function importBatch(files: { software: UploadFile; usage: UploadFile; rules: UploadFile }, adminId: string) {
  const parsed = await parseImport({ software: files.software.bytes, usage: files.usage.bytes, rules: files.rules.bytes }).catch((error: unknown) => {
    throw new ImportFileError(error instanceof Error ? error.message : "文件解析失败");
  });
  const fileDigest = digest([files.software, files.usage, files.rules]);
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO import_batches
        (digest, imported_by, software_filename, usage_filename, rules_filename, report_generated_at, rules_generated_at, user_count, usage_count, rule_count, warnings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT (digest) DO NOTHING RETURNING id::text`,
      [fileDigest, adminId, files.software.name, files.usage.name, files.rules.name, parsed.reportGeneratedAt, parsed.rulesGeneratedAt, parsed.users.length, parsed.usage.length, parsed.rules.length, JSON.stringify(parsed.warnings)],
    );
    if (!inserted.rowCount) {
      const existing = await client.query("SELECT id::text FROM import_batches WHERE digest=$1", [fileDigest]);
      await client.query("COMMIT");
      return { id: existing.rows[0].id as string, duplicate: true, warnings: parsed.warnings, userCount: parsed.users.length };
    }
    const batchId = inserted.rows[0].id as string;
    for (const user of parsed.users) {
      await client.query(
        "INSERT INTO user_snapshots (batch_id, account, name, department, status, actual_user, source_data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [batchId, user.account, user.name, user.department, user.status, user.actualUser, JSON.stringify(user)],
      );
    }
    for (const row of parsed.usage) {
      await client.query(
        "INSERT INTO usage_snapshots (batch_id, account, volume, used_bytes, hard_percent, shared) VALUES ($1,$2,$3,$4,$5,$6)",
        [batchId, row.account, row.volume, row.usedBytes, row.hardPercent, row.shared],
      );
    }
    for (const rule of parsed.rules) {
      await client.query(
        "INSERT INTO quota_rules (batch_id, account, volume, limit_bytes, is_default) VALUES ($1,$2,$3,$4,$5)",
        [batchId, rule.account, rule.volume, rule.limitBytes, rule.isDefault],
      );
    }
    const accounts = parsed.users.map((user) => user.account);
    await client.query(
      "UPDATE account_state SET missing_streak=missing_streak+1, deleted=(missing_streak+1>=3) WHERE NOT (account = ANY($1::text[]))",
      [accounts],
    );
    for (const account of accounts) {
      await client.query(
        `INSERT INTO account_state (account,missing_streak,deleted,last_seen_batch)
         VALUES ($1,0,false,$2)
         ON CONFLICT (account) DO UPDATE SET missing_streak=0,deleted=false,last_seen_batch=EXCLUDED.last_seen_batch`,
        [account, batchId],
      );
    }
    await client.query("COMMIT");
    return { id: batchId, duplicate: false, warnings: parsed.warnings, userCount: parsed.users.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
