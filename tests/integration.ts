import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { importBatch } from "../lib/import-service";
import { ensureSchema, pool } from "../lib/db";
import { dashboard, userDetail } from "../lib/data";
import { createTicket, lookupTicket, validateTicket } from "../lib/tickets";

const headers = ["用户账号", "用户名称", "用户类型", "所属部门", "权限组", "组内角色", "默认集群", "设计主机", "手机号", "邮箱", "创建时间", "状态", "备注"];

async function software(accounts: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("用户数据");
  sheet.addRow(headers);
  for (const account of accounts) sheet.addRow([account, `测试${account}`, "普通", "测试部门", "", "", "", "", "", "", "2026-10-14", "正常", `使用人${account}`]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function usage(alphaGiB: number): Buffer {
  const head = ["类型", "卷", "Storage VM", "qtree", "用户", "组", "已用空间软限制百分比", "已用空间硬限制百分比", "已用总空间", "已用文件软限制百分比", "已用文件硬限制百分比", "已用总空间"];
  const row = (volume: string, account: string, percent: string, bytes: number) => ["user", volume, "svm_nfs", "-", account, "-", "", percent, String(bytes), "", "", "0"].join(",");
  const rows = [row("data", "alpha", String(Math.round(alphaGiB / 2048 * 100)), alphaGiB * 1024 ** 3), row("home", "alpha", "20", 10 * 1024 ** 3)];
  if (alphaGiB === 20) rows.push(row("data", "beta", "0", 0), row("home", "beta", "0", 0));
  return Buffer.from(["报告:,配额报告", "已生成:,2026年10月14日 10:00", "集群:,TEST", "", head.join(","), ...rows].join("\n"), "utf8");
}

function rules(): Buffer {
  const head = ["类型", "卷", "Storage VM", "qtree", "用户", "组", "空间硬限制", "文件硬限制"];
  const row = (volume: string, account: string, bytes: number) => ["user", volume, "svm_nfs", "-", account, "-", String(bytes), ""].join(",");
  return Buffer.from(["报告:,配额规则", "已生成:,2026年10月14日 10:00", "集群:,TEST", "", head.join(","), row("home", "所有用户", 50 * 1024 ** 3), row("data", "所有用户", 1024 ** 4), row("data", "alpha", 2 * 1024 ** 4)].join("\n"), "utf8");
}

async function main() {
  await ensureSchema();
  const admin = await pool().query("SELECT id::text FROM admins LIMIT 1");
  const adminId = admin.rows[0].id as string;
  const ruleFile = { name: "rules.csv", bytes: rules() };
  const makeFiles = async (accounts: string[], amount: number) => ({ software: { name: "users.xlsx", bytes: await software(accounts) }, usage: { name: "usage.csv", bytes: usage(amount) }, rules: ruleFile });
  const firstFiles = await makeFiles(["alpha", "beta"], 20);
  const first = await importBatch(firstFiles, adminId);
  assert.equal(first.duplicate, false);
  const repeated = await importBatch(firstFiles, adminId);
  assert.equal(repeated.duplicate, true);
  for (const amount of [30, 40, 50]) await importBatch(await makeFiles(["alpha"], amount), adminId);
  const state = await pool().query("SELECT missing_streak,deleted FROM account_state WHERE account='beta'");
  assert.deepEqual(state.rows[0], { missing_streak: 3, deleted: true });
  const current = await dashboard();
  assert.equal(current.stats.users, 1);
  assert.equal(current.users[0].data_limit, String(2 * 1024 ** 4));
  assert.equal(current.users[0].data_used, String(50 * 1024 ** 3));
  const detail = await userDetail("alpha");
  assert.equal(detail?.history.length, 4);
  const input = validateTicket({ applicantName: "测试申请人", employeeId: "T-1001", items: [{ account: "alpha", field: "限额", volume: "data", requestedValue: "3 TB", reason: "项目需要" }] });
  const ticket = await createTicket(input, "integration-test");
  const found = await lookupTicket(ticket.trackingCode, "T-1001");
  assert.equal(found?.status, "待处理");
  const afterTicket = await dashboard();
  assert.equal(afterTicket.users[0].data_limit, String(2 * 1024 ** 4));
  console.log("Synthetic database integration passed: import, deduplication, history, missing streak, ticket isolation.");
  await pool().end();
}

main().catch(async (error) => { console.error(error); await pool().end(); process.exitCode = 1; });
