import { activityFilters, activityRows, queryValue, sortActivity, type AnalysisQuery } from "@/lib/activity";
import { activityBatchList, activitySnapshots } from "@/lib/data";

export async function loadActivity(query: AnalysisQuery) {
  const batches = await activityBatchList();
  const filters = activityFilters(query, batches);
  const snapshots = await activitySnapshots(filters.selected.map(batch => batch.id), filters.volume);
  const all = activityRows(filters.selected, snapshots, filters.gb * 1024 ** 3, filters.intervals);
  const keyword = filters.q.toLowerCase();
  const matching = all.filter(row =>
    (!filters.group || row.department.trim() === filters.group) &&
    (!filters.status || row.status.trim() === filters.status) &&
    (!keyword || [row.account, row.name, row.actual_user, row.department].some(value => value.toLowerCase().includes(keyword))));
  const rows = sortActivity(matching.filter(row => filters.scope === "all" ||
    (filters.scope === "review" ? row.candidate : !row.complete)), filters.sort, filters.ascending);
  const detail = rows.find(row => row.account === queryValue(query, "account"));
  const groupOptions = [...new Set(all.map(row => row.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const statusOptions = [...new Set(all.map(row => row.status.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return {
    batches, filters, rows, detail, groupOptions, statusOptions,
    matching: matching.length,
    candidates: matching.filter(row => row.candidate).length,
    incomplete: matching.filter(row => !row.complete).length,
  };
}
