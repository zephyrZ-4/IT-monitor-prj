import { queryValue, type AnalysisQuery } from "@/lib/activity";
import type { AnalysisContext } from "@/lib/analysis-service";
import { enrichUsers, filterUsers, groupSummaries, metrics, rankUsers, type AnalysisRow, type GroupSummary, type Ranking } from "@/lib/analytics";
import { formatBytes } from "@/lib/format";

export const rankingIssues = [
  ["all", "全部账号"], ["threshold", "达到使用率阈值"], ["over", "超过限额"],
  ["stopped", "已停用"], ["mismatch", "使用人不一致"], ["blank", "使用人未填写"],
  ["missing", "用量未采集完整"], ["lowuse", "大限额低使用"],
] as const;

export function rankingsView(context: AnalysisContext, query: AnalysisQuery) {
  const issue = rankingIssues.find(([key]) => key === queryValue(query, "issue"))?.[0] ?? "all";
  const sort = (["limit", "used", "utilization", "growth"] as const).find(key => key === queryValue(query, "sort")) ?? "limit";
  const ascending = query.order === "asc";
  const match = (user: AnalysisRow) => issue === "all" ||
    (issue === "threshold" && user.utilization !== null && user.utilization >= context.filters.threshold) ||
    (issue === "over" && user.utilization !== null && user.utilization > 100) ||
    (issue === "stopped" && user.stopped) || (issue === "mismatch" && user.nameMismatch) ||
    (issue === "blank" && user.actualUserMissing) || (issue === "missing" && user.usedBytes === null) ||
    (issue === "lowuse" && user.limitBytes >= 1024 ** 4 && user.utilization !== null && user.utilization < 10);
  return {
    issue, sort, ascending,
    ranked: rankUsers(context.selected.filter(user => match(user) && (sort !== "growth" || user.growthBytes !== null)), sort, ascending),
  };
}

const projectSorts = ["limit", "used", "accounts", "utilization", "stopped", "mismatch"] as const;
export type ProjectSort = typeof projectSorts[number];

export function projectsView(context: AnalysisContext, query: AnalysisQuery) {
  const sort = projectSorts.find(key => key === queryValue(query, "sort")) ?? "limit";
  const ascending = query.order === "asc";
  const value = (group: GroupSummary) => sort === "limit" ? group.limitBytes : sort === "used" ? group.knownUsedBytes : sort === "utilization" ? group.utilization ?? -1 : group[sort];
  const groups = context.groups.filter(group => !context.filters.group || group.group === context.filters.group)
    .sort((a, b) => (ascending ? value(a) - value(b) : value(b) - value(a)) || a.group.localeCompare(b.group, "zh-CN"));
  const accounts = rankUsers(context.selected, "limit");
  return { sort, ascending, groups, accounts };
}

export const changeKinds = {
  entered: "进入范围", left: "离开范围", department: "归属变化", status: "状态变化",
  actual: "实际使用人变化", limit: "限额变化", used: "已用变化", coverage: "采集状态变化",
} as const;
type ChangeKind = keyof typeof changeKinds;
export const changeSorts = [["account", "账号"], ["kind", "变化类型"], ["abs", "已用变化幅度"], ["net", "已用净变化"], ["limit", "限额变化幅度"]] as const;

export function signedBytes(value: number | null, unit: "GB" | "TB" = "TB") {
  if (value === null) return "—";
  return (value > 0 ? "+" : value < 0 ? "−" : "") + formatBytes(Math.abs(value), unit);
}

type AccountChange = {
  account: string; name: string; kinds: ChangeKind[]; detail: string[];
  current: AnalysisRow | null; previous: AnalysisRow | null;
  usedDelta: number | null; limitDelta: number | null;
};

export function changesView(context: AnalysisContext, query: AnalysisQuery) {
  const { batch, batches, filters, selected, rawUsers } = context;
  const batchIndex = batches.findIndex(item => item.id === batch?.id);
  const older = batchIndex >= 0 ? batches.slice(batchIndex + 1) : [];
  const compare = older.find(item => item.id === queryValue(query, "compare")) ?? older[0] ?? null;
  const before = compare ? filterUsers(enrichUsers(rawUsers.filter(user => user.batch_id === compare.id), [], filters.volume), filters) : [];
  const currentMetrics = metrics(selected, filters.threshold), beforeMetrics = metrics(before, filters.threshold);
  const previousAccounts = new Map(before.map(user => [user.account, user]));
  const currentAccounts = new Map(selected.map(user => [user.account, user]));
  const kind: ChangeKind | "" = (Object.keys(changeKinds) as ChangeKind[]).find(key => key === queryValue(query, "kind")) ?? "";
  const sort = changeSorts.find(([key]) => key === queryValue(query, "sort"))?.[0] ?? "account";
  const ascending = query.order === "asc" || (!query.order && (sort === "account" || sort === "kind"));
  const accountChanges: AccountChange[] = [];
  if (compare) for (const account of new Set([...previousAccounts.keys(), ...currentAccounts.keys()])) {
    const old = previousAccounts.get(account) ?? null, now = currentAccounts.get(account) ?? null;
    const detail: string[] = [], kinds: ChangeKind[] = [];
    const add = (key: ChangeKind, text: string = changeKinds[key]) => { kinds.push(key); detail.push(text); };
    let usedDelta: number | null = null, limitDelta: number | null = null;
    if (!old) add("entered", "进入当前范围");
    else if (!now) add("left", "离开当前范围");
    else {
      if (old.department !== now.department) add("department", "归属：" + (old.department || "未填写") + " → " + (now.department || "未填写"));
      if (old.status !== now.status) add("status", "状态：" + (old.status || "未填写") + " → " + (now.status || "未填写"));
      if (old.actual_user !== now.actual_user) add("actual");
      limitDelta = now.limitBytes - old.limitBytes;
      if (limitDelta !== 0) add("limit", "限额 " + signedBytes(limitDelta, "GB"));
      if (old.usedBytes !== null && now.usedBytes !== null) {
        usedDelta = now.usedBytes - old.usedBytes;
        if (usedDelta !== 0) add("used", "已用 " + signedBytes(usedDelta, "GB"));
      } else if ((old.usedBytes === null) !== (now.usedBytes === null)) add("coverage", "用量采集状态变化");
    }
    if (kinds.length && (!kind || kinds.includes(kind))) accountChanges.push({ account, name: now?.name ?? old?.name ?? "", kinds, detail, current: now, previous: old, usedDelta, limitDelta });
  }
  const numeric = (change: AccountChange) => sort === "limit" ? change.limitDelta === null ? null : Math.abs(change.limitDelta) : sort === "abs" && change.usedDelta !== null ? Math.abs(change.usedDelta) : change.usedDelta;
  accountChanges.sort((a, b) => {
    const order = ascending ? 1 : -1;
    const tie = a.account.localeCompare(b.account);
    if (sort === "account") return tie * order;
    if (sort === "kind") return a.kinds.map(key => changeKinds[key]).join("、").localeCompare(b.kinds.map(key => changeKinds[key]).join("、"), "zh-CN") * order || tie;
    const x = numeric(a), y = numeric(b);
    return x === null ? y === null ? tie : 1 : y === null ? -1 : (x - y) * order || tie;
  });
  const currentGroups = new Map(groupSummaries(selected, filters.threshold).map(group => [group.group, group]));
  const beforeGroups = new Map(groupSummaries(before, filters.threshold).map(group => [group.group, group]));
  const groupChanges = [...new Set([...currentGroups.keys(), ...beforeGroups.keys()])]
    .map(group => ({ group, current: currentGroups.get(group), previous: beforeGroups.get(group) }))
    .sort((a, b) => (b.current?.limitBytes ?? 0) - (a.current?.limitBytes ?? 0));
  return { older, compare, currentMetrics, beforeMetrics, accountChanges, groupChanges, kind, sort, ascending };
}
