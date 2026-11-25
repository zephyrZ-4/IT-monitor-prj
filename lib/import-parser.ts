import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

export type Volume = "home" | "data";

export interface SoftwareUser {
  account: string;
  name: string;
  userType: string;
  department: string;
  permissionGroup: string;
  groupRole: string;
  defaultCluster: string;
  designHost: string;
  phone: string;
  email: string;
  createdAtSource: string;
  status: string;
  actualUser: string;
}

export interface UsageRow {
  account: string;
  volume: Volume;
  usedBytes: number;
  hardPercent: number | null;
  shared: boolean;
}

export interface QuotaRule {
  account: string;
  volume: Volume;
  limitBytes: number;
  isDefault: boolean;
}

export interface ParsedImport {
  users: SoftwareUser[];
  usage: UsageRow[];
  rules: QuotaRule[];
  reportGeneratedAt: string;
  rulesGeneratedAt: string;
  warnings: string[];
}

function value(row: ExcelJS.Row, index: number): string {
  return row.getCell(index).text.trim();
}

function requireText(text: string, label: string): string {
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function toBytes(text: string, label: string): number {
  if (!/^\d+$/.test(text)) throw new Error(`${label}不是非负整数`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`${label}超过可安全处理的整数范围`);
  return value;
}

function parseVolume(text: string, label: string): Volume {
  if (text === "home" || text === "data") return text;
  throw new Error(`${label}的卷必须为 home 或 data`);
}

function csvRows(buffer: Buffer, expectedTitle: string): string[][] {
  let decoded = "";
  for (const encoding of ["utf-8", "gb18030"]) {
    try {
      const candidate = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      if (candidate.includes(expectedTitle)) {
        decoded = candidate;
        break;
      }
    } catch {
      // Try the other encoding.
    }
  }
  if (!decoded) throw new Error(`无法识别${expectedTitle}文件编码或报告类型`);
  const rows = parseCsv(decoded, { bom: true, skip_empty_lines: false, relax_column_count: true }) as string[][];
  if (rows.length < 5 || rows[0]?.[0] !== "报告:" || rows[0]?.[1] !== expectedTitle) {
    throw new Error(`${expectedTitle}文件缺少报告说明行`);
  }
  return rows;
}

export async function parseSoftwareUsers(buffer: Buffer): Promise<SoftwareUser[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new Error("软件用户文件不是有效的 XLSX");
  }
  const sheet = workbook.getWorksheet("用户数据");
  if (!sheet) throw new Error("软件用户文件缺少“用户数据”工作表");
  const headers = ["用户账号", "用户名称", "用户类型", "所属部门", "权限组", "组内角色", "默认集群", "设计主机", "手机号", "邮箱", "创建时间", "状态", "备注"];
  for (let i = 0; i < headers.length; i++) {
    if (value(sheet.getRow(1), i + 1) !== headers[i]) {
      throw new Error(`软件用户文件第 ${i + 1} 列表头应为“${headers[i]}”`);
    }
  }
  const users: SoftwareUser[] = [];
  const seen = new Set<string>();
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (row.actualCellCount === 0) continue;
    const account = requireText(value(row, 1), `软件用户第 ${n} 行账号`);
    if (seen.has(account)) throw new Error(`软件用户账号重复：${account}`);
    seen.add(account);
    users.push({
      account,
      name: value(row, 2),
      userType: value(row, 3),
      department: value(row, 4),
      permissionGroup: value(row, 5),
      groupRole: value(row, 6),
      defaultCluster: value(row, 7),
      designHost: value(row, 8),
      phone: value(row, 9),
      email: value(row, 10),
      createdAtSource: value(row, 11),
      status: value(row, 12),
      actualUser: value(row, 13),
    });
  }
  if (!users.length) throw new Error("软件用户文件没有用户记录");
  return users;
}

export function parseUsage(buffer: Buffer): { rows: UsageRow[]; generatedAt: string } {
  const csv = csvRows(buffer, "配额报告");
  const expected: Record<number, string> = { 0: "类型", 1: "卷", 4: "用户", 7: "已用空间硬限制百分比", 8: "已用总空间" };
  for (const [position, header] of Object.entries(expected)) {
    if (csv[4]?.[Number(position)] !== header) throw new Error(`用量 CSV 第 ${Number(position) + 1} 列表头应为“${header}”`);
  }
  const rows: UsageRow[] = [];
  const seen = new Set<string>();
  for (let i = 5; i < csv.length; i++) {
    const row = csv[i];
    if (row.every((cell) => !cell.trim())) continue;
    if (row.length < 9 || row[0] !== "user") throw new Error(`用量 CSV 第 ${i + 1} 行结构无效`);
    const volume = parseVolume(row[1], `用量 CSV 第 ${i + 1} 行`);
    const account = requireText(row[4]?.trim(), `用量 CSV 第 ${i + 1} 行用户`);
    const key = `${account}\0${volume}`;
    if (seen.has(key)) throw new Error(`用量 CSV 用户/卷重复：${account}/${volume}`);
    seen.add(key);
    const hardPercent = row[7]?.trim() ? Number(row[7]) : null;
    if (hardPercent !== null && (!Number.isFinite(hardPercent) || hardPercent < 0)) throw new Error(`用量 CSV 第 ${i + 1} 行百分比无效`);
    rows.push({ account, volume, hardPercent, usedBytes: toBytes(row[8]?.trim(), `用量 CSV 第 ${i + 1} 行已用空间`), shared: /[,，;]/.test(account) });
  }
  if (!rows.length) throw new Error("用量 CSV 没有数据记录");
  return { rows, generatedAt: csv[1]?.[1] ?? "" };
}

export function parseRules(buffer: Buffer): { rows: QuotaRule[]; generatedAt: string } {
  const csv = csvRows(buffer, "配额规则");
  const expected: Record<number, string> = { 0: "类型", 1: "卷", 4: "用户", 6: "空间硬限制" };
  for (const [position, header] of Object.entries(expected)) {
    if (csv[4]?.[Number(position)] !== header) throw new Error(`规则 CSV 第 ${Number(position) + 1} 列表头应为“${header}”`);
  }
  const rows: QuotaRule[] = [];
  const seen = new Set<string>();
  for (let i = 5; i < csv.length; i++) {
    const row = csv[i];
    if (row.every((cell) => !cell.trim())) continue;
    if (row.length < 7 || row[0] !== "user") throw new Error(`规则 CSV 第 ${i + 1} 行结构无效`);
    const volume = parseVolume(row[1], `规则 CSV 第 ${i + 1} 行`);
    const account = requireText(row[4]?.trim(), `规则 CSV 第 ${i + 1} 行用户`);
    const key = `${account}\0${volume}`;
    if (seen.has(key)) throw new Error(`规则 CSV 用户/卷重复：${account}/${volume}`);
    seen.add(key);
    const limitBytes = toBytes(row[6]?.trim(), `规则 CSV 第 ${i + 1} 行空间硬限制`);
    if (limitBytes <= 0) throw new Error(`规则 CSV 第 ${i + 1} 行空间硬限制必须大于 0`);
    rows.push({ account, volume, limitBytes, isDefault: account === "所有用户" });
  }
  for (const volume of ["home", "data"] as const) {
    if (!rows.some((row) => row.isDefault && row.volume === volume)) throw new Error(`规则 CSV 缺少 ${volume} 的“所有用户”默认规则`);
  }
  return { rows, generatedAt: csv[1]?.[1] ?? "" };
}

export async function parseImport(files: { software: Buffer; usage: Buffer; rules: Buffer }): Promise<ParsedImport> {
  const users = await parseSoftwareUsers(files.software);
  const usage = parseUsage(files.usage);
  const rules = parseRules(files.rules);
  const userSet = new Set(users.map((user) => user.account));
  const usageSet = new Set(usage.rows.map((row) => row.account));
  const usageKeys = new Set(usage.rows.map((row) => `${row.account}\0${row.volume}`));
  const warnings: string[] = [];
  for (const user of users) {
    if (!usageSet.has(user.account)) {
      warnings.push(`软件用户 ${user.account} 没有存储用量记录`);
    } else {
      for (const volume of ["home", "data"] as const) {
        if (!usageKeys.has(`${user.account}\0${volume}`)) warnings.push(`软件用户 ${user.account} 缺少 ${volume} 用量记录`);
      }
    }
  }
  for (const row of usage.rows) if (!userSet.has(row.account)) warnings.push(`${row.shared ? "共享" : "未关联"}存储记录：${row.account}/${row.volume}`);
  const limits = new Map(rules.rows.map((row) => [`${row.account}\0${row.volume}`, row.limitBytes]));
  for (const row of usage.rows) {
    if (row.hardPercent === null) continue;
    const limit = limits.get(`${row.account}\0${row.volume}`) ?? limits.get(`所有用户\0${row.volume}`)!;
    const calculated = (row.usedBytes / limit) * 100;
    if (Math.abs(Math.round(calculated) - row.hardPercent) > 2) {
      warnings.push(`${row.account}/${row.volume} 的报告百分比与规则计算结果不一致`);
    }
  }
  return { users, usage: usage.rows, rules: rules.rows, reportGeneratedAt: usage.generatedAt, rulesGeneratedAt: rules.generatedAt, warnings };
}
