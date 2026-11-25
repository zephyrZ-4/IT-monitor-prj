import { randomBytes, randomUUID } from "node:crypto";
import { ensureSchema, pool } from "@/lib/db";
import { latestBatch } from "@/lib/data";
import { defaultTicketType, isTicketType, MAX_POLARION_APPLICANTS, ticketTypes, type TicketType } from "@/lib/ticket-types";

export const TICKET_FIELDS = ["所属部门", "状态", "实际使用人", "限额"] as const;
export type TicketField = (typeof TICKET_FIELDS)[number];

export interface TicketItemInput {
  account: string;
  field: TicketField;
  volume: "home" | "data" | null;
  requestedValue: string;
  reason: string;
}

export interface TicketInput {
  type: TicketType;
  applicantName: string;
  employeeId: string;
  items: TicketItemInput[];
  additionalApplicants?: ApplicantInput[];
  website?: string;
}

export type ApplicantInput = { applicantName: string; employeeId: string };

function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label}不能为空`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${label}长度须为 1-${max} 个字符`);
  return result;
}

export function validateTicket(body: unknown): TicketInput {
  if (!body || typeof body !== "object") throw new Error("工单内容无效");
  const source = body as Record<string, unknown>;
  const type = source.type === undefined ? defaultTicketType : source.type;
  if (!isTicketType(type)) throw new Error("请选择有效的工单类型");
  const applicantName = bounded(source.applicantName, "申请人姓名", 60);
  const employeeId = bounded(source.employeeId, "工号", 60);
  const website = typeof source.website === "string" ? source.website : "";
  if (!ticketTypes[type].hasItems) {
    if (source.items !== undefined && (!Array.isArray(source.items) || source.items.length)) throw new Error("此类工单不需要填写资源修改项");
    const extra = source.additionalApplicants;
    if (extra === undefined) return { type, applicantName, employeeId, items: [], website };
    if (type !== "polarion-user" || !Array.isArray(extra) || extra.length >= MAX_POLARION_APPLICANTS) throw new Error("Polarion 每单最多申请 " + MAX_POLARION_APPLICANTS + " 人");
    const seen = new Set([employeeId.toLowerCase()]);
    const additionalApplicants = extra.map((raw, index): ApplicantInput => {
      const position = index + 2;
      if (!raw || typeof raw !== "object") throw new Error("第 " + position + " 位申请人信息无效");
      const item = raw as Record<string, unknown>;
      const employee = bounded(item.employeeId, "第 " + position + " 位工号", 60);
      const name = bounded(item.applicantName, "第 " + position + " 位姓名", 60);
      if (seen.has(employee.toLowerCase())) throw new Error("同一张工单不能重复填写工号：" + employee);
      seen.add(employee.toLowerCase());
      return { applicantName: name, employeeId: employee };
    });
    return { type, applicantName, employeeId, items: [], additionalApplicants, website };
  }
  if (source.additionalApplicants !== undefined) throw new Error("集群资源工单只填写一位申请人");
  if (!Array.isArray(source.items) || source.items.length < 1 || source.items.length > 10) throw new Error("每个工单须包含 1-10 条修改项");
  const items = source.items.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`第 ${index + 1} 条修改项无效`);
    const item = raw as Record<string, unknown>;
    const account = bounded(item.account, `第 ${index + 1} 条账号`, 100);
    const field = item.field;
    if (!TICKET_FIELDS.includes(field as TicketField)) throw new Error(`第 ${index + 1} 条字段不允许申请`);
    const volume = field === "限额" ? item.volume : null;
    if (field === "限额" && volume !== "home" && volume !== "data") throw new Error(`第 ${index + 1} 条限额申请须选择目录`);
    const requestedValue = bounded(item.requestedValue, `第 ${index + 1} 条目标值`, 200);
    if (field === "限额" && !/^\d+(?:\.\d{1,2})?\s*(?:GB|TB)$/i.test(requestedValue)) throw new Error(`第 ${index + 1} 条限额请填写如“2 TB”的值`);
    const reason = bounded(item.reason, `第 ${index + 1} 条原因`, 1000);
    return { account, field: field as TicketField, volume: volume as "home" | "data" | null, requestedValue, reason };
  });
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.account}\0${item.field}\0${item.volume || ""}`;
    if (seen.has(key)) throw new Error("同一工单不能重复申请相同账号、字段和目录");
    seen.add(key);
  }
  return { type, applicantName, employeeId, items, website };
}

export async function createTicket(input: TicketInput, ip: string) {
  await ensureSchema();
  const requiresItems = ticketTypes[input.type].hasItems;
  const batch = requiresItems ? await latestBatch() : null;
  if (requiresItems && !batch) throw new Error("管理员尚未导入用户数据，暂不能提交集群资源工单");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    if (ip !== "unknown") {
      const recent = await client.query("SELECT count(*)::int AS n FROM tickets WHERE submitted_ip=$1 AND created_at>now()-interval '10 minutes'", [ip]);
      if (Number(recent.rows[0].n) >= 5) throw new Error("提交过于频繁，请稍后再试");
    }
    if (batch) {
      const accounts = [...new Set(input.items.map((item) => item.account))];
      const found = await client.query("SELECT account FROM user_snapshots WHERE batch_id=$1 AND account=ANY($2::text[])", [batch.id, accounts]);
      if (found.rowCount !== accounts.length) throw new Error("工单中存在不属于最新用户清单的账号");
    }
    const id = randomUUID();
    const trackingCode = randomBytes(12).toString("base64url");
    await client.query(
      "INSERT INTO tickets (id,tracking_code,applicant_name,employee_id,submitted_ip,ticket_type) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, trackingCode, input.applicantName, input.employeeId, ip, input.type],
    );
    if (input.type === "polarion-user") {
      for (const [index, applicant] of (input.additionalApplicants ?? []).entries()) {
        await client.query(
          "INSERT INTO ticket_additional_applicants (ticket_id,position,applicant_name,employee_id) VALUES ($1,$2,$3,$4)",
          [id, index + 2, applicant.applicantName, applicant.employeeId],
        );
      }
    }
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      await client.query(
        "INSERT INTO ticket_items (ticket_id,position,account,field,volume,requested_value,reason) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, i + 1, item.account, item.field, item.volume, item.requestedValue, item.reason],
      );
    }
    await client.query("COMMIT");
    return { id, trackingCode };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function lookupTicket(trackingCode: string, employeeId: string, type: TicketType = defaultTicketType) {
  await ensureSchema();
  const result = await pool().query(
    "SELECT id,ticket_type,status,created_at,updated_at,admin_note FROM tickets WHERE tracking_code=$1 AND employee_id=$2 AND ticket_type=$3",
    [trackingCode.trim(), employeeId.trim(), type],
  );
  return result.rows[0] ?? null;
}
