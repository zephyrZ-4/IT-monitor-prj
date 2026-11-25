import type { VolumeMode } from "@/lib/analytics";
import type { Batch } from "@/lib/data";

export type AnalysisQuery = Record<string, string | string[] | undefined>;
export type ActivityBatch = Pick<Batch, "id" | "imported_at" | "user_count">;
export type ActivitySnapshot = {
  batch_id: string;
  account: string;
  name: string;
  department: string;
  status: string;
  actual_user: string;
  used_bytes: string | null;
};
export type ActivityObservation = {
  batch: ActivityBatch;
  state: "recorded" | "missing" | "absent";
  used: number | null;
  delta: number | null;
};
export type ActivityRow = ActivitySnapshot & {
  points: ActivityObservation[];
  observed: number;
  comparable: number;
  complete: boolean;
  presentAtEnd: boolean;
  firstUsed: number | null;
  lastUsed: number | null;
  net: number | null;
  movement: number | null;
  streak: number;
  candidate: boolean;
};

export const activitySorts = [
  ["movement", "逐批变化总量"], ["net", "起止用量差"], ["streak", "连续低变化次数"],
  ["last", "结束批次用量"], ["coverage", "有效比较次数"],
] as const;
export type ActivitySort = typeof activitySorts[number][0];
export const activityScopes = [["all", "全部账号"], ["review", "待复核账号"], ["incomplete", "采集不完整"]] as const;

export function queryValue(query: AnalysisQuery, key: string): string {
  return typeof query[key] === "string" ? query[key].trim() : "";
}

export function activityFilters(query: AnalysisQuery, batches: ActivityBatch[]) {
  const endId = queryValue(query, "end") || queryValue(query, "batch");
  const requestedEnd = Math.max(0, batches.findIndex(batch => batch.id === endId));
  const requestedStart = batches.findIndex(batch => batch.id === queryValue(query, "start"));
  const endIndex = requestedStart < 0 ? requestedEnd : Math.min(requestedStart, requestedEnd);
  const startIndex = requestedStart < 0 ? Math.min(endIndex + 3, batches.length - 1) : Math.max(requestedStart, requestedEnd);
  const threshold = queryValue(query, "gb");
  const gb = threshold && Number.isFinite(Number(threshold)) ? Math.max(0, Math.min(1_000_000, Number(threshold))) : 1;
  const rawIntervals = Number(queryValue(query, "intervals"));
  const intervals = Number.isSafeInteger(rawIntervals) && rawIntervals >= 1 ? Math.min(rawIntervals, 9999) : 3;
  const sort = activitySorts.find(([key]) => key === queryValue(query, "sort"))?.[0] ?? "movement";
  const scope = activityScopes.find(([key]) => key === queryValue(query, "scope"))?.[0] ?? "all";
  const order = queryValue(query, "order") || (sort === "streak" || sort === "coverage" ? "desc" : "asc");
  const volume: VolumeMode = queryValue(query, "volume") === "home" ? "home" : "data";
  return {
    start: batches[startIndex]?.id ?? "",
    end: batches[endIndex]?.id ?? "",
    selected: batches.slice(endIndex, startIndex + 1).reverse(),
    gb, intervals, sort, scope, ascending: order !== "desc", volume,
    group: queryValue(query, "group"), status: queryValue(query, "status"), q: queryValue(query, "q").slice(0, 200),
  };
}

export function activityRows(batches: ActivityBatch[], snapshots: ActivitySnapshot[], thresholdBytes: number, minIntervals: number): ActivityRow[] {
  const histories = new Map<string, Map<string, ActivitySnapshot>>();
  const included = new Set(batches.map(batch => batch.id));
  for (const item of snapshots) {
    if (!included.has(item.batch_id)) continue;
    const history = histories.get(item.account) ?? new Map<string, ActivitySnapshot>();
    history.set(item.batch_id, item);
    histories.set(item.account, history);
  }
  return Array.from(histories.values(), history => {
    let identity: ActivitySnapshot | undefined;
    let previous: number | null = null;
    let observed = 0, comparable = 0, movement = 0, streak = 0;
    const points = batches.map((batch): ActivityObservation => {
      const item = history.get(batch.id);
      if (item) identity = item;
      const used = item?.used_bytes != null ? Number(item.used_bytes) : null;
      if (used !== null) observed++;
      const delta = previous !== null && used !== null ? used - previous : null;
      if (delta !== null) { comparable++; movement += Math.abs(delta); }
      streak = delta !== null && Math.abs(delta) <= thresholdBytes ? streak + 1 : 0;
      previous = used;
      return { batch, state: !item ? "absent" : used === null ? "missing" : "recorded", used, delta };
    });
    const complete = observed === batches.length;
    const firstUsed = points[0].used, lastUsed = points[points.length - 1].used;
    return {
      ...identity!, points, observed, comparable, complete, firstUsed, lastUsed, streak,
      presentAtEnd: points[points.length - 1].state !== "absent",
      net: points.length > 1 && firstUsed !== null && lastUsed !== null ? lastUsed - firstUsed : null,
      movement: comparable > 0 ? movement : null,
      candidate: complete && streak >= minIntervals,
    };
  });
}

export function sortActivity(rows: ActivityRow[], sort: ActivitySort, ascending: boolean): ActivityRow[] {
  const metric = (row: ActivityRow) => {
    if (sort === "movement") return row.complete ? row.movement : null;
    if (sort === "net") return row.net;
    if (sort === "streak") return row.comparable > 0 ? row.streak : null;
    if (sort === "last") return row.lastUsed;
    return row.comparable;
  };
  return [...rows].sort((a, b) => {
    const left = metric(a), right = metric(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    return (left !== null && right !== null ? (left - right) * (ascending ? 1 : -1) : 0) || a.account.localeCompare(b.account);
  });
}

export const observationLabels = { recorded: "已采集", missing: "用量未采集", absent: "账号未在本批出现" } as const;

export function activityLabel(row: ActivityRow) {
  return !row.presentAtEnd ? "结束批次未出现" : !row.complete ? "采集不完整" : row.candidate ? "待复核" : row.points.length < 2 ? "批次不足" : "未达到复核条件";
}
