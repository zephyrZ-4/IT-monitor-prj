import type { Batch, UserView } from "@/lib/data";

export type VolumeMode = "data" | "home";
export type Ranking = "limit" | "used" | "utilization" | "growth";

export interface AnalysisFilters {
  batch: string;
  group: string;
  status: string;
  volume: VolumeMode;
  threshold: number;
  q: string;
}

export interface AnalysisRow extends UserView {
  limitBytes: number;
  knownUsedBytes: number;
  usedBytes: number | null;
  utilization: number | null;
  growthBytes: number | null;
  nameMismatch: boolean;
  actualUserMissing: boolean;
  stopped: boolean;
}

export interface Metrics {
  accounts: number;
  normal: number;
  stopped: number;
  mismatch: number;
  actualMissing: number;
  collected: number;
  missingUsage: number;
  thresholdCount: number;
  overLimit: number;
  limitBytes: number;
  knownUsedBytes: number;
  collectedLimitBytes: number;
  utilization: number | null;
}

export interface GroupSummary extends Metrics {
  group: string;
  users: AnalysisRow[];
}

export interface TrendPoint extends Metrics {
  id: string;
  date: Date;
  group: string;
}

export function normalizeFilters(query: Record<string, string | string[] | undefined>, batches: Batch[]): AnalysisFilters {
  const one = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const volume = one("volume");
  const rawThreshold = Number(one("threshold") || 80);
  return {
    batch: batches.some((batch) => batch.id === one("batch")) ? one("batch") : batches[0]?.id ?? "",
    group: one("group").trim(),
    status: one("status").trim(),
    volume: volume === "home" ? "home" : "data",
    threshold: Number.isFinite(rawThreshold) ? Math.min(1000, Math.max(0, rawThreshold)) : 80,
    q: one("q").trim().slice(0, 200),
  };
}

export function bytesFor(user: UserView, volume: VolumeMode): { limit: number; knownUsed: number; used: number | null } {
  const limit = Number(user[`${volume}_limit`] || 0);
  const used = user[`${volume}_used`];
  const knownUsed = Number(used || 0);
  return { limit, knownUsed, used: used === null ? null : knownUsed };
}

export function nameMismatch(user: UserView): boolean {
  const name = user.name.trim();
  const actual = user.actual_user.trim();
  return Boolean(name && actual && name !== actual);
}

export function enrichUsers(users: UserView[], previous: UserView[], volume: VolumeMode): AnalysisRow[] {
  const previousByAccount = new Map(previous.map((user) => [user.account, user]));
  return users.map((user) => {
    const current = bytesFor(user, volume);
    const before = previousByAccount.get(user.account);
    const previousUsed = before ? bytesFor(before, volume).used : null;
    return {
      ...user,
      limitBytes: current.limit,
      knownUsedBytes: current.knownUsed,
      usedBytes: current.used,
      utilization: current.used !== null && current.limit > 0 ? current.used / current.limit * 100 : null,
      growthBytes: current.used !== null && previousUsed !== null ? current.used - previousUsed : null,
      nameMismatch: nameMismatch(user),
      actualUserMissing: !user.actual_user.trim(),
      stopped: user.status.trim() === "已停用",
    };
  });
}

export function filterUsers(users: AnalysisRow[], filters: AnalysisFilters, includeGroup = true): AnalysisRow[] {
  const q = filters.q.toLocaleLowerCase();
  return users.filter((user) =>
    (!includeGroup || !filters.group || user.department.trim() === filters.group) &&
    (!filters.status || user.status.trim() === filters.status) &&
    (!q || [user.account, user.name, user.department, user.actual_user].some((value) => value.toLocaleLowerCase().includes(q))),
  );
}

export function metrics(users: AnalysisRow[], threshold: number): Metrics {
  const collected = users.filter((user) => user.usedBytes !== null);
  const knownUsedBytes = users.reduce((sum, user) => sum + user.knownUsedBytes, 0);
  const collectedUsedBytes = collected.reduce((sum, user) => sum + (user.usedBytes ?? 0), 0);
  const collectedLimitBytes = collected.reduce((sum, user) => sum + user.limitBytes, 0);
  return {
    accounts: users.length,
    normal: users.filter((user) => user.status.trim() === "正常").length,
    stopped: users.filter((user) => user.stopped).length,
    mismatch: users.filter((user) => user.nameMismatch).length,
    actualMissing: users.filter((user) => user.actualUserMissing).length,
    collected: collected.length,
    missingUsage: users.length - collected.length,
    thresholdCount: users.filter((user) => user.utilization !== null && user.utilization >= threshold).length,
    overLimit: users.filter((user) => user.utilization !== null && user.utilization > 100).length,
    limitBytes: users.reduce((sum, user) => sum + user.limitBytes, 0),
    knownUsedBytes,
    collectedLimitBytes,
    utilization: collectedLimitBytes > 0 ? collectedUsedBytes / collectedLimitBytes * 100 : null,
  };
}

export function groupSummaries(users: AnalysisRow[], threshold: number): GroupSummary[] {
  const groups = new Map<string, AnalysisRow[]>();
  for (const user of users) {
    const group = user.department.trim() || "未填写部门";
    groups.set(group, [...(groups.get(group) ?? []), user]);
  }
  return [...groups].map(([group, members]) => ({ group, users: members, ...metrics(members, threshold) }));
}

export function trendPoints(batches: Batch[], users: UserView[], filters: AnalysisFilters): TrendPoint[] {
  const byBatch = new Map<string, UserView[]>();
  for (const user of users) byBatch.set(user.batch_id, [...(byBatch.get(user.batch_id) ?? []), user]);
  return [...batches].reverse().map((batch) => {
    const enriched = enrichUsers(byBatch.get(batch.id) ?? [], [], filters.volume);
    const selected = filterUsers(enriched, filters);
    return { id: batch.id, date: batch.imported_at, group: filters.group, ...metrics(selected, filters.threshold) };
  });
}

export function rankUsers(users: AnalysisRow[], ranking: Ranking, ascending = false): AnalysisRow[] {
  const value = (user: AnalysisRow) => ranking === "limit" ? user.limitBytes : ranking === "used" ? user.usedBytes : ranking === "growth" ? user.growthBytes : user.utilization;
  return [...users].sort((a, b) => {
    const aa = value(a);
    const bb = value(b);
    if (aa === null && bb === null) return a.account.localeCompare(b.account);
    if (aa === null) return 1;
    if (bb === null) return -1;
    return (ascending ? aa - bb : bb - aa) || a.account.localeCompare(b.account);
  });
}

export function previousBatch(batches: Batch[], selected: Batch): Batch | null {
  const index = batches.findIndex((batch) => batch.id === selected.id);
  return index >= 0 ? batches[index + 1] ?? null : null;
}
