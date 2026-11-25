import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { ensureSchema, pool } from "../lib/db";
import { importBatch } from "../lib/import-service";

async function main() {
  if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_PORT !== "15488") {
    throw new Error("此脚本只允许连接本机 15488 端口的预览数据库隧道");
  }
  const database = "cluster_monitor_real";
  const client = new Client({ host: process.env.DB_HOST, port: 15488, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: "postgres" });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE ${database}`);
  } finally {
    await client.end();
  }
  process.env.DB_NAME = database;
  await ensureSchema();
  const admin = await pool().query<{ id: string }>("SELECT id::text FROM admins LIMIT 1");
  const directory = join(process.cwd(), "example_datas");
  const names = readdirSync(directory).filter((name) => !name.startsWith("~$"));
  const pick = (fragment: string) => {
    const name = names.find((item) => item.includes(fragment));
    if (!name) throw new Error(`样例目录缺少 ${fragment}`);
    return { name, bytes: readFileSync(join(directory, name)) };
  };
  const result = await importBatch({ software: pick("用户数据全量导出"), usage: pick("quota-reports"), rules: pick("quota-rules") }, admin.rows[0].id);
  console.log(`Real preview import: batch ${result.id}; users ${result.userCount}; warnings ${result.warnings.length}; duplicate ${result.duplicate}`);
  await pool().end();
}

main().catch(async (error) => { console.error(error); await pool().end(); process.exitCode = 1; });
