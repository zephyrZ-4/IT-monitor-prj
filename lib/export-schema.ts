import { isTicketType, ticketTypes } from "@/lib/ticket-types";

export type ExportColumn = { key: string; label: string; format?: "capacity" | "percent" };
export type ExportSheet = { key: string; label: string; columns: ExportColumn[]; byAccount?: boolean; optional?: boolean };
type ExportViewDefinition = { title: string; sheets: ExportSheet[] };

const col = (key: string, label: string, format?: ExportColumn["format"]): ExportColumn => ({ key, label, format });
const size = (key: string, label: string) => col(key, label, "capacity");
const rate = (key: string, label: string) => col(key, label, "percent");
const identity = [col("account", "账号"), col("name", "用户名称"), col("department", "项目 / 部门"), col("status", "账号状态"), col("actual_user", "实际使用人")];
const bothVolumes = [size("dataUsed", "Data 已用"), size("dataLimit", "Data 限额"), rate("dataRate", "Data 使用率"), size("homeUsed", "Home 已用"), size("homeLimit", "Home 限额"), rate("homeRate", "Home 使用率")];
const analysisAccounts = [...identity, size("limit", "限额"), size("used", "已用"), rate("utilization", "使用率"), size("growth", "较上批变化"), col("coverage", "采集状态")];
const metrics = [
  col("accounts", "账号数"), col("normal", "正常"), col("stopped", "已停用"), col("mismatch", "使用人不一致"),
  col("actualMissing", "实际使用人未填写"), size("limitBytes", "限额"), size("knownUsedBytes", "已采集用量"), rate("utilization", "已采集账号使用率"),
  col("collected", "已采集账号数"), col("missingUsage", "未采集账号数"), col("thresholdCount", "达到使用率阈值"), col("overLimit", "超过限额"),
];
const groupMetrics = [col("group", "项目 / 部门"), ...metrics];
const trend = { key: "trend", label: "历史趋势", columns: [col("batch", "批次"), col("date", "导入时间"), ...metrics], optional: true };
const unlinked = [col("account", "存储用户字段"), col("volume", "目录"), size("used", "已用"), rate("utilization", "报告使用率")];

export const exportViews = {
  dashboard: { title: "数据总览", sheets: [
    { key: "accounts", label: "用户数据", columns: [...identity, ...bothVolumes], byAccount: true },
    { key: "summary", label: "整批统计", columns: [col("users", "软件用户数"), size("dataUsed", "Data 已采集用量"), size("homeUsed", "Home 已采集用量"), col("nearLimit", "接近或超过限额账号数")], optional: true },
    { key: "shared", label: "共享用量记录", columns: unlinked, optional: true },
    { key: "unmatched", label: "未关联存储记录", columns: unlinked, optional: true },
  ] },
  overview: { title: "分析总览", sheets: [
    { key: "summary", label: "指标总览", columns: [...metrics, size("dataLimit", "Data 限额"), size("dataUsed", "Data 已采集用量"), size("homeLimit", "Home 限额"), size("homeUsed", "Home 已采集用量"), col("shared", "整批共享记录"), col("unmatched", "整批未关联记录")] },
    { key: "groups", label: "项目与部门", columns: groupMetrics },
    { key: "accounts", label: "账号明细", columns: analysisAccounts, byAccount: true },
    trend,
  ] },
  projects: { title: "项目与部门分析", sheets: [
    { key: "groups", label: "项目与部门", columns: [...groupMetrics, size("dataLimit", "Data 限额"), size("dataUsed", "Data 已采集用量"), col("dataCollected", "Data 已采集账号数"), size("homeLimit", "Home 限额"), size("homeUsed", "Home 已采集用量"), col("homeCollected", "Home 已采集账号数")] },
    { key: "accounts", label: "账号明细", columns: analysisAccounts, byAccount: true },
    trend,
  ] },
  rankings: { title: "账号排行与异常", sheets: [
    { key: "accounts", label: "账号排行", columns: [col("rank", "名次"), ...analysisAccounts], byAccount: true },
  ] },
  changes: { title: "历史变化", sheets: [
    { key: "summary", label: "对比指标", columns: [col("label", "批次"), ...metrics], optional: true },
    { key: "groups", label: "项目与部门变化", columns: [
      col("group", "项目 / 部门"), col("beforeAccounts", "对比批次账号数"), col("accounts", "当前账号数"), col("accountDelta", "账号数变化"),
      size("beforeLimit", "对比批次限额"), size("limit", "当前限额"), size("limitDelta", "限额变化"),
      size("beforeUsed", "对比批次已采集用量"), size("used", "当前已采集用量"), size("usedDelta", "已采集用量变化"),
      col("beforeCoverage", "对比批次采集覆盖"), col("coverage", "当前采集覆盖"),
    ] },
    { key: "accounts", label: "发生变化的账号", columns: [
      col("account", "账号"), col("name", "用户名称"), col("kinds", "变化类型"), col("detail", "变化内容"),
      size("beforeLimit", "对比批次限额"), size("limit", "当前限额"), size("limitDelta", "限额变化"),
      size("beforeUsed", "对比批次已用"), size("used", "当前已用"), size("usedDelta", "已用变化"),
    ], byAccount: true },
  ] },
  activity: { title: "账号用量活跃度", sheets: [
    { key: "accounts", label: "账号用量活跃度", columns: [
      ...identity, size("firstUsed", "起始用量"), size("lastUsed", "结束用量"), size("net", "起止用量差"),
      size("movement", "逐批变化总量"), col("observed", "已采集批次"), col("total", "区间批次"),
      col("comparable", "有效比较次数"), col("streak", "连续低变化次数"), col("result", "复核状态"),
    ], byAccount: true },
    { key: "points", label: "逐批用量", columns: [
      col("account", "账号"), col("name", "用户名称"), col("batch", "批次"), col("date", "导入时间"), col("state", "采集状态"), size("used", "已用"), size("delta", "较前一批变化"),
    ], byAccount: true, optional: true },
  ] },
  user: { title: "用户详情", sheets: [
    { key: "accounts", label: "用户信息", columns: [...identity, ...bothVolumes] },
    { key: "history", label: "用量与限额历史", columns: [col("batch", "批次"), col("date", "导入时间"), ...identity, ...bothVolumes] },
  ] },
  tickets: { title: "工单列表", sheets: [
    { key: "tickets", label: "工单列表", columns: [col("code", "查询编号"), col("type", "工单类型"), col("date", "提交时间"), col("applicant", "首位申请人"), col("employee", "首位工号"), col("status", "工单状态"), col("count", "事项数"), col("applicantCount", "申请人数"), col("note", "处理备注")] },
    { key: "items", label: "工单事项", columns: [col("code", "查询编号"), col("type", "工单类型"), col("position", "序号"), col("account", "账号"), col("field", "字段"), col("volume", "目录"), col("requested", "期望修改值"), col("reason", "申请原因")], optional: true },
    { key: "applicants", label: "Polarion 申请人名单", columns: [col("code", "查询编号"), col("position", "序号"), col("applicant", "姓名"), col("employee", "工号")], optional: true },
  ] },
} satisfies Record<string, ExportViewDefinition>;

export type ExportView = keyof typeof exportViews;
export type ExportUnit = "GB" | "TB";
export function exportDefinition(view: ExportView, type?: string): ExportViewDefinition {
  const definition: ExportViewDefinition = exportViews[view];
  if (view === "tickets" && isTicketType(type) && !ticketTypes[type].hasItems) {
    return { ...definition, sheets: definition.sheets.filter(sheet => sheet.key !== "items").map(sheet => ({ ...sheet, optional: false, columns: sheet.columns.filter(column => column.key !== "count") })) };
  }
  if (view === "tickets" && type === "cluster-resource") {
    return { ...definition, sheets: definition.sheets.filter(sheet => sheet.key !== "applicants").map(sheet => ({ ...sheet, columns: sheet.columns.filter(column => column.key !== "applicantCount") })) };
  }
  return definition;
}
export const exportColumnLabel = (column: ExportColumn, unit: ExportUnit) => column.format === "capacity" ? column.label + "（" + unit + "）" : column.label;
