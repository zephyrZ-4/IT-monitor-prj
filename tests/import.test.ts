import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseImport } from "../lib/import-parser";
import { validateTicket } from "../lib/tickets";

const sampleDir = join(process.cwd(), "example_datas");
const names = readdirSync(sampleDir);
const find = (fragment: string) => readFileSync(join(sampleDir, names.find((name) => name.includes(fragment) && !name.startsWith("~$"))!));

test("sample import preserves default rules, byte units, and shared usage", async () => {
  const result = await parseImport({ software: find("20260918"), usage: find("quota-reports"), rules: find("quota-rules") });
  assert.equal(result.users.length, 234);
  assert.equal(result.usage.length, 466);
  assert.equal(result.rules.length, 57);
  assert.equal(result.rules.find((rule) => rule.isDefault && rule.volume === "home")?.limitBytes, 50 * 1024 ** 3);
  assert.equal(result.rules.find((rule) => rule.isDefault && rule.volume === "data")?.limitBytes, 1024 ** 4);
  const shared = result.usage.filter((row) => row.shared);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].account, "yle,sypeng");
  assert.equal(shared[0].usedBytes, 3060026085376);
  assert.ok(result.warnings.some((warning) => warning.includes("yle,sypeng") && warning.includes("不一致")));
  assert.ok(result.warnings.some((warning) => warning.includes("ktconsole") && warning.includes("没有存储用量")));
});

test("ticket validation enforces quota volume and item count", () => {
  const base = { applicantName: "测试", employeeId: "10001", items: [{ account: "zlyang", field: "限额", volume: "data", requestedValue: "2 TB", reason: "工作需要" }] };
  assert.equal(validateTicket(base).type, "cluster-resource");
  assert.equal(validateTicket(base).items[0].volume, "data");
  assert.throws(() => validateTicket({ ...base, items: [{ ...base.items[0], volume: null }] }), /选择目录/);
  assert.throws(() => validateTicket({ ...base, items: Array(11).fill(base.items[0]) }), /1-10/);
});

test("Polarion requests accept only applicant details and preserve the employee ID", () => {
  const base = { type: "polarion-user", applicantName: " 测试 ", employeeId: " 00001 " };
  assert.deepEqual(validateTicket(base), { type: "polarion-user", applicantName: "测试", employeeId: "00001", items: [], website: "" });
  assert.throws(() => validateTicket({ ...base, employeeId: "" }), /工号/);
  assert.throws(() => validateTicket({ ...base, items: [{ account: "test" }] }), /不需要填写/);
  assert.throws(() => validateTicket({ ...base, type: "other" }), /工单类型/);
});

test("Polarion batch requests enforce a complete and unique employee list", () => {
  const first = { type: "polarion-user", applicantName: "首位", employeeId: "A001" };
  const extra = Array.from({ length: 9 }, (_, index) => ({ applicantName: " 其他申请人 ", employeeId: "000" + (index + 1) }));
  const result = validateTicket({ ...first, additionalApplicants: extra });
  assert.equal(result.employeeId, "A001");
  assert.equal(result.additionalApplicants?.length, 9);
  assert.deepEqual(result.additionalApplicants?.[0], { applicantName: "其他申请人", employeeId: "0001" });
  assert.throws(() => validateTicket({ ...first, additionalApplicants: [...extra, extra[0]] }), /最多申请 10 人/);
  assert.throws(() => validateTicket({ ...first, additionalApplicants: [{ ...extra[0], employeeId: " a001 " }] }), /不能重复/);
  assert.throws(() => validateTicket({ ...first, additionalApplicants: [extra[0], extra[0]] }), /不能重复/);
  assert.throws(() => validateTicket({ ...first, additionalApplicants: [{ ...extra[0], applicantName: "" }] }), /第 2 位姓名/);
});
