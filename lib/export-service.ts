import ExcelJS from "exceljs";
import { activityLabel, observationLabels, queryValue, type AnalysisQuery } from "@/lib/activity";
import { loadActivity } from "@/lib/activity-service";
import { loadAnalysis } from "@/lib/analysis-service";
import { changeKinds, changesView, projectsView, rankingIssues, rankingsView } from "@/lib/analysis-views";
import { enrichUsers, metrics, type AnalysisRow } from "@/lib/analytics";
import { dashboard, ticketExportRecords, userDetail, type Batch, type UserView } from "@/lib/data";
import { exportColumnLabel, exportDefinition, exportViews, type ExportUnit, type ExportView } from "@/lib/export-schema";
import { formatDate, utilization } from "@/lib/format";
import { isTicketType, ticketTypeLabel, ticketTypes } from "@/lib/ticket-types";

type Value = string | number | null;
type Row = Record<string, Value>;
export class ExportError extends Error {}
const sheetLimit = 100_000;
const supportedQuery = ["q", "batch", "volume", "threshold", "group", "status", "issue", "sort", "order", "compare", "kind", "start", "end", "gb", "intervals", "scope", "account", "type"];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseExportRequest(body: unknown) {
  if (!isObject(body) || typeof body.view !== "string" || !Object.hasOwn(exportViews, body.view)) throw new ExportError("无法识别导出页面");
  const view = body.view as ExportView;
  const input = isObject(body.query) ? body.query : {};
  const query: AnalysisQuery = Object.fromEntries(supportedQuery.flatMap(key => typeof input[key] === "string" ? [[key, input[key].slice(0, 200)]] : []));
  const type = queryValue(query, "type");
  if (view === "tickets" && type && !isTicketType(type)) throw new ExportError("请选择有效的工单类型");
  const definition = exportDefinition(view, type);
  const unit: ExportUnit = body.unit === "TB" ? "TB" : "GB";
  let accounts: Set<string> | null = null;
  if (body.accounts !== undefined) {
    const list = body.accounts;
    if (!Array.isArray(list) || list.length < 1 || list.length > 20_000 || list.some(value => typeof value !== "string" || value.length > 200)) throw new ExportError("请选择有效的账号");
    accounts = new Set<string>(list);
  }
  if (!isObject(body.columns)) throw new ExportError("请选择要导出的工作表和列");
  const fields = body.columns;
  const sheets = definition.sheets.flatMap(sheet => {
    if (accounts && !sheet.byAccount) return [];
    const keys = fields[sheet.key];
    if (!Array.isArray(keys)) return [];
    const columns = sheet.columns.filter(column => keys.includes(column.key));
    return columns.length ? [{ ...sheet, columns }] : [];
  });
  if (!sheets.length) throw new ExportError("至少选择一张工作表及一列");
  return { view, query, unit, sheets, accounts };
}

type Request = ReturnType<typeof parseExportRequest>;
type StorageRow = Pick<UserView, "account" | "name" | "department" | "status" | "actual_user" | "data_used" | "data_limit" | "home_used" | "home_limit">;
const number = (value: string | number | null | undefined): number | null => value == null ? null : Number(value);
const identity = (row: Pick<StorageRow, "account" | "name" | "department" | "status" | "actual_user">) =>
  ({ account: row.account, name: row.name, department: row.department, status: row.status, actual_user: row.actual_user });
const storage = (row: StorageRow) => ({
  ...identity(row), dataUsed: number(row.data_used), dataLimit: number(row.data_limit), dataRate: utilization(row.data_used, row.data_limit),
  homeUsed: number(row.home_used), homeLimit: number(row.home_limit), homeRate: utilization(row.home_used, row.home_limit),
});
const accountRow = (row: AnalysisRow) => ({
  ...identity(row), limit: row.limitBytes, used: row.usedBytes, utilization: row.utilization, growth: row.growthBytes,
  coverage: row.usedBytes === null ? "用量未采集" : "已采集",
});
const stamp = (batch: Pick<Batch, "id" | "imported_at"> | null | undefined) => batch ? "#" + batch.id + " · " + formatDate(batch.imported_at) : "无";
const volumeLabel = (volume: string) => volume === "home" ? "Home" : "Data";
const coverage = (row: { collected: number; accounts: number } | undefined) => row ? row.collected + "/" + row.accounts : "0/0";

async function exportData(request: Request) {
  const { view, query, accounts, sheets } = request;
  const wants = (key: string) => sheets.some(sheet => sheet.key === key);
  const pick = <T extends { account: string }>(rows: T[]) => {
    if (!accounts) return rows;
    const selected = rows.filter(row => accounts.has(row.account));
    if (!selected.length) throw new ExportError("所选账号已不在当前筛选结果中，请刷新页面后重试");
    return selected;
  };
  const rows: Record<string, Row[]> = {};
  const notes: Value[][] = [["报表", exportDefinition(view).title], ["导出范围", accounts ? "勾选的账号" : "当前筛选的全部结果（不受分页限制）"], ["容量单位", request.unit + "（1024 进制）"]];
  if (view === "dashboard") {
    const q = queryValue(query, "q");
    const data = await dashboard(q, queryValue(query, "batch"));
    if (!data.batch) throw new ExportError("该批次没有可导出的数据");
    notes.push(["批次", stamp(data.batch)], ["目录", "Data、Home 分列"], ["账号关键词", q || "全部"], ["整批数据", "整批统计、共享及未关联记录不受账号关键词影响；接近或超过限额指任一目录使用率 ≥ 80%"]);
    if (wants("accounts")) rows.accounts = pick(data.users).map(storage);
    if (wants("summary")) rows.summary = [data.stats];
    for (const key of ["shared", "unmatched"] as const) if (wants(key)) {
      rows[key] = data[key].map(row => ({ account: row.account, volume: volumeLabel(row.volume), used: number(row.used_bytes), utilization: number(row.hard_percent) }));
    }
  } else if (view === "user") {
    const account = queryValue(query, "account"), batch = queryValue(query, "batch");
    if (!account || !/^\d{1,19}$/.test(batch) || BigInt(batch) > 9223372036854775807n) throw new ExportError("无效的账号或批次");
    const data = await userDetail(account, batch);
    if (!data) throw new ExportError("该批次中没有此账号");
    notes.push(["账号", account], ["截至批次", stamp(data.batch)], ["目录", "Data、Home 分列"], ["历史范围", "与账号详情一致，最多 30 批该账号出现的记录"]);
    if (wants("accounts")) rows.accounts = [storage(data.user)];
    if (wants("history")) rows.history = data.history.map(row => ({ ...storage({ ...row, account }), batch: row.id, date: formatDate(row.imported_at) }));
  } else if (view === "tickets") {
    const status = queryValue(query, "status");
    const requested = queryValue(query, "type");
    const type = isTicketType(requested) ? requested : "";
    const data = await ticketExportRecords(status, { items: wants("items"), applicants: wants("applicants") }, type);
    notes.push(["工单类型", type ? ticketTypeLabel(type) : "全部"], ["工单状态", status || "全部"]);
    if (wants("tickets")) rows.tickets = data.rows.map(row => ({ code: row.tracking_code, type: ticketTypeLabel(row.ticket_type), date: formatDate(row.created_at), applicant: row.applicant_name, employee: row.employee_id, status: row.status, count: ticketTypes[row.ticket_type]?.hasItems ? row.item_count : null, applicantCount: row.applicant_count, note: row.admin_note }));
    if (wants("items")) rows.items = data.items.map(row => ({ code: row.tracking_code, type: ticketTypeLabel(row.ticket_type), position: row.position, account: row.account, field: row.field, volume: row.volume, requested: row.requested_value, reason: row.reason }));
    if (wants("applicants")) rows.applicants = data.applicants.map(row => ({ code: row.tracking_code, position: row.position, applicant: row.applicant_name, employee: row.employee_id }));
  } else if (view === "activity") {
    const data = await loadActivity(query), f = data.filters;
    if (!f.selected.length) throw new ExportError("暂无可导出的导入批次");
    const users = pick(data.rows);
    notes.push(["起始批次", stamp(f.selected[0])], ["结束批次", stamp(f.selected.at(-1))], ["批次数", f.selected.length],
      ["目录", volumeLabel(f.volume)], ["项目 / 部门", f.group || "全部"], ["账号状态", f.status || "全部"], ["关键词", f.q || "全部"],
      ["低变化阈值（GB）", f.gb], ["连续低变化要求（次）", f.intervals],
      ["口径", "逐批变化总量为相邻有效比较的绝对值之和；不跨缺采补算。待复核要求区间完整，且结束前连续达标。用量平稳不能证明账号未使用。"]);
    if (wants("accounts")) rows.accounts = users.map(row => ({
      ...identity(row), firstUsed: row.firstUsed, lastUsed: row.lastUsed, net: row.net, movement: row.movement, observed: row.observed,
      total: row.points.length, comparable: row.comparable, streak: row.comparable ? row.streak : null, result: activityLabel(row),
    }));
    if (wants("points")) {
      if (users.length * f.selected.length > sheetLimit) throw new ExportError("逐批明细超过单表 10 万行，请缩小批次范围或勾选要导出的账号");
      rows.points = users.flatMap(row => row.points.map(point => ({ account: row.account, name: row.name, batch: point.batch.id, date: formatDate(point.batch.imported_at), state: observationLabels[point.state], used: point.used, delta: point.delta })));
    }
  } else {
    const context = await loadAnalysis(query);
    const { batch, filters, selected } = context;
    if (!batch) throw new ExportError("暂无可导出的导入批次");
    if (queryValue(query, "batch") && queryValue(query, "batch") !== batch.id) throw new ExportError("该批次已不在当前分析范围内，请刷新页面后重试");
    notes.push(["批次", stamp(batch)], ["目录", volumeLabel(filters.volume)], ["项目 / 部门", filters.group || "全部"], ["账号状态", filters.status || "全部"],
      ["关键词", filters.q || "全部"], ["使用率阈值（%）", filters.threshold], ["口径", "缺失用量留空；已采集用量不含共享记录。"]);
    if (view === "rankings") {
      const data = rankingsView(context, query);
      const ranks = new Map(data.ranked.map((row, index) => [row.account, index + 1]));
      notes.push(["核查类别", rankingIssues.find(([key]) => key === data.issue)?.[1] ?? "全部账号"], ["增长对比批次", stamp(context.previous)]);
      rows.accounts = pick(data.ranked).map(row => ({ ...accountRow(row), rank: ranks.get(row.account) ?? null }));
    } else if (view === "changes") {
      const data = changesView(context, query);
      if (!data.compare) throw new ExportError("历史变化至少需要两批数据");
      notes.push(["对比批次", stamp(data.compare)], ["变化类型", data.kind ? changeKinds[data.kind] : "全部"], ["范围说明", "进入或离开筛选范围可能由项目归属或账号状态变化造成。"]);
      if (wants("summary")) rows.summary = [{ label: stamp(data.compare), ...data.beforeMetrics }, { label: stamp(batch), ...data.currentMetrics }];
      if (wants("groups")) rows.groups = data.groupChanges.map(({ group, current, previous }) => ({
        group, beforeAccounts: previous?.accounts ?? 0, accounts: current?.accounts ?? 0, accountDelta: (current?.accounts ?? 0) - (previous?.accounts ?? 0),
        beforeLimit: previous?.limitBytes ?? 0, limit: current?.limitBytes ?? 0, limitDelta: (current?.limitBytes ?? 0) - (previous?.limitBytes ?? 0),
        beforeUsed: previous?.knownUsedBytes ?? 0, used: current?.knownUsedBytes ?? 0, usedDelta: (current?.knownUsedBytes ?? 0) - (previous?.knownUsedBytes ?? 0),
        beforeCoverage: coverage(previous), coverage: coverage(current),
      }));
      if (wants("accounts")) rows.accounts = pick(data.accountChanges).map(row => ({
        account: row.account, name: row.name, kinds: row.kinds.map(key => changeKinds[key]).join("、"), detail: row.detail.join("；"),
        beforeLimit: row.previous?.limitBytes ?? null, limit: row.current?.limitBytes ?? null, limitDelta: row.limitDelta,
        beforeUsed: row.previous?.usedBytes ?? null, used: row.current?.usedBytes ?? null, usedDelta: row.usedDelta,
      }));
    } else {
      const data = view === "projects" ? projectsView(context, query) : {
        groups: context.groups.filter(group => !filters.group || group.group === filters.group).sort((a, b) => b.limitBytes - a.limitBytes),
        accounts: [...selected].sort((a, b) => b.limitBytes - a.limitBytes),
      };
      if (wants("summary")) {
        const disk = metrics(enrichUsers(selected, [], "data"), filters.threshold), home = metrics(enrichUsers(selected, [], "home"), filters.threshold);
        const shared = context.unlinked.filter(row => row.shared).length;
        rows.summary = [{ ...context.summary, dataLimit: disk.limitBytes, dataUsed: disk.knownUsedBytes, homeLimit: home.limitBytes, homeUsed: home.knownUsedBytes, shared, unmatched: context.unlinked.length - shared }];
      }
      if (wants("groups")) rows.groups = data.groups.map(({ users, ...group }) => {
        if (view !== "projects") return group;
        const disk = metrics(enrichUsers(users, [], "data"), filters.threshold), home = metrics(enrichUsers(users, [], "home"), filters.threshold);
        return { ...group, dataLimit: disk.limitBytes, dataUsed: disk.knownUsedBytes, dataCollected: disk.collected, homeLimit: home.limitBytes, homeUsed: home.knownUsedBytes, homeCollected: home.collected };
      });
      if (wants("accounts")) rows.accounts = pick(data.accounts).map(accountRow);
      if (wants("trend")) rows.trend = context.trend.map(({ id, date, ...row }) => ({ ...row, batch: id, date: formatDate(date) }));
    }
  }
  return { rows, notes };
}

export async function buildExport(request: Request) {
  const { rows, notes } = await exportData(request);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IT监控平台";
  const divisor = request.unit === "TB" ? 1024 ** 4 : 1024 ** 3;
  for (const sheet of request.sheets) {
    const data = rows[sheet.key] ?? [];
    if (data.length > sheetLimit) throw new ExportError("单表超过 10 万行，请缩小筛选范围后重试");
    const page = workbook.addWorksheet(sheet.label, { views: [{ state: "frozen", ySplit: 1 }] });
    page.columns = sheet.columns.map(column => {
      const label = exportColumnLabel(column, request.unit);
      return {
        key: column.key, header: label, width: column.key === "detail" || column.key === "reason" ? 54 : Math.max(17, label.length * 2 + 3),
        style: column.format ? { numFmt: column.format === "percent" ? "0.00%" : "#,##0.00##" } : {},
      };
    });
    for (const record of data) page.addRow(sheet.columns.map(column => {
      const value = record[column.key] ?? null;
      if (typeof value !== "number") return value;
      if (!Number.isFinite(value)) return null;
      return column.format === "capacity" ? value / divisor : column.format === "percent" ? value / 100 : value;
    }));
    page.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    styleHeader(page.getRow(1));
    notes.push([sheet.label + "行数", data.length]);
  }
  const info = workbook.addWorksheet("导出说明");
  info.columns = [{ header: "项目", width: 29 }, { header: "说明", width: 95 }];
  notes.push(["导出时间（北京时间）", formatDate(new Date())]);
  info.addRows(notes);
  info.getColumn(2).alignment = { vertical: "middle", wrapText: true };
  styleHeader(info.getRow(1));
  const name = exportDefinition(request.view).title + "-" + new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) + ".xlsx";
  return { name, bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) };
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263445" } };
    cell.alignment = { vertical: "middle" };
  });
}
