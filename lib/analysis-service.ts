import { analysisSnapshots, unlinkedUsage, type Batch, type UserView } from "@/lib/data";
import { enrichUsers, filterUsers, groupSummaries, metrics, normalizeFilters, previousBatch, trendPoints, type AnalysisFilters, type AnalysisRow } from "@/lib/analytics";

export interface AnalysisContext {
  batches: Batch[];
  batch: Batch | null;
  previous: Batch | null;
  filters: AnalysisFilters;
  all: AnalysisRow[];
  selected: AnalysisRow[];
  previousUsers: UserView[];
  rawUsers: UserView[];
  summary: ReturnType<typeof metrics>;
  groups: ReturnType<typeof groupSummaries>;
  trend: ReturnType<typeof trendPoints>;
  groupOptions: string[];
  statusOptions: string[];
  unlinked: Awaited<ReturnType<typeof unlinkedUsage>>;
}

export async function loadAnalysis(query: Record<string, string | string[] | undefined>): Promise<AnalysisContext> {
  const { batches, users } = await analysisSnapshots();
  const filters = normalizeFilters(query, batches);
  const batch = batches.find((item) => item.id === filters.batch) ?? null;
  const batchIndex = batches.findIndex((item) => item.id === batch?.id);
  const previous = batch ? previousBatch(batches, batch) : null;
  const allCurrent = users.filter((user) => user.batch_id === batch?.id);
  const previousUsers = users.filter((user) => user.batch_id === previous?.id);
  const all = enrichUsers(allCurrent, previousUsers, filters.volume);
  const selected = filterUsers(all, filters);
  const forGroups = filterUsers(all, filters, false);
  return {
    batches,
    batch,
    previous,
    filters,
    all,
    selected,
    previousUsers,
    rawUsers: users,
    summary: metrics(selected, filters.threshold),
    groups: groupSummaries(forGroups, filters.threshold),
    trend: trendPoints(batchIndex >= 0 ? batches.slice(batchIndex) : [], users, filters),
    groupOptions: [...new Set(allCurrent.map((user) => user.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    statusOptions: [...new Set(allCurrent.map((user) => user.status.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    unlinked: batch ? await unlinkedUsage(batch.id) : [],
  };
}
