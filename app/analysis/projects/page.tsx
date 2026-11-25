import Link from "next/link";
import { Shell } from "@/components/shell";
import { AnalysisControls, analysisParams, analysisUrl } from "@/components/analysis-controls";
import { ExportPanel } from "@/components/export-panel";
import { AnalysisChart } from "@/components/analysis-chart";
import { AnalysisUserTable, MissingUsageBadge } from "@/components/analysis-tables";
import { loadAnalysis } from "@/lib/analysis-service";
import { enrichUsers, metrics } from "@/lib/analytics";
import { projectsView, type ProjectSort } from "@/lib/analysis-views";
import { formatBytes, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectAnalysis({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const context = await loadAnalysis(query);
  const { filters, batch } = context;
  const { sort, ascending, groups, accounts } = projectsView(context, query);
  const exportQuery = analysisParams(filters, { sort, order: ascending ? "asc" : "desc" });
  const sortLink = (key: ProjectSort, label: string) => <Link className={sort === key ? "sort-active" : ""} href={analysisUrl("/analysis/projects", filters, { sort: key, order: sort === key && !ascending ? "asc" : "desc" })}>{label}{sort === key ? ascending ? " ↑" : " ↓" : ""}</Link>;
  return <Shell title="项目与部门分析" subtitle="所属部门作为当批项目归属，限额与已用分别汇总">
    {!batch ? <div className="card"><div className="empty">暂无可分析的导入数据</div></div> : <>
      <AnalysisControls context={context} path="/analysis/projects" extra={{ sort, order: exportQuery.order }}/>
      <ExportPanel key={JSON.stringify(exportQuery)} view="projects" query={exportQuery} accounts={accounts.map(({ account, name }) => ({ account, name }))}/>
      <div className="notice">分组取自软件用户文件当批的“所属部门”。项目代号和“项目池”等其他部门值都保留源文件原名；每次导入仍只需三份源文件。</div>
      <div className="card"><div className="card-head"><h2>项目 / 部门汇总</h2><span className="muted">{groups.length} 个分组 · 点击表头排序 · “部分未采集”表示已用只统计已采集数据</span></div><div className="table-wrap"><table><thead><tr><th>项目 / 部门</th><th>{sortLink("accounts", "账号数")}</th><th>{sortLink("limit", "所选目录限额")}</th><th>{sortLink("used", "所选目录已用")}</th><th>{sortLink("utilization", "已采集账号使用率")}</th><th>采集覆盖</th><th>Data 限额</th><th>Data 已用</th><th>Home 限额</th><th>Home 已用</th><th>{sortLink("stopped", "已停用")}</th><th>{sortLink("mismatch", "使用人不一致")}</th><th>超阈值</th></tr></thead><tbody>
        {groups.map((group) => {
          const data = metrics(enrichUsers(group.users, [], "data"), filters.threshold);
          const home = metrics(enrichUsers(group.users, [], "home"), filters.threshold);
          return <tr key={group.group}><td><Link className="link strong-link" href={analysisUrl("/analysis/projects", filters, { group: group.group })}>{group.group}</Link></td><td>{group.accounts}</td><td className="mono">{formatBytes(group.limitBytes, "TB")}</td><td className="mono">{formatBytes(group.knownUsedBytes, "TB")}<MissingUsageBadge count={group.missingUsage}/></td><td>{formatPercent(group.utilization)}</td><td>{group.collected}/{group.accounts}</td><td className="mono">{formatBytes(data.limitBytes, "TB")}</td><td className="mono">{formatBytes(data.knownUsedBytes, "TB")}<MissingUsageBadge count={data.missingUsage}/></td><td className="mono">{formatBytes(home.limitBytes, "TB")}</td><td className="mono">{formatBytes(home.knownUsedBytes, "TB")}<MissingUsageBadge count={home.missingUsage}/></td><td>{group.stopped}</td><td>{group.mismatch}</td><td>{group.thresholdCount}</td></tr>;
        })}
      </tbody></table>{!groups.length && <div className="empty">当前筛选没有项目或部门</div>}</div></div>
      {filters.group && <><div className="card"><div className="card-head"><h2>{filters.group} · 历史限额与用量</h2><span className="muted">按各批次当时归属统计</span></div><div className="card-body"><AnalysisChart points={context.trend}/></div></div><div className="card"><div className="card-head"><h2>{filters.group} · 账号明细</h2><span className="muted">{accounts.length} 个账号</span></div><AnalysisUserTable users={accounts} batchId={batch.id}/></div></>}
      <div className="analysis-footnote">已用量是已采集部分之和；缺失用量不按 0 处理。共享用量独立展示，不分摊到任何项目。</div>
    </>}
  </Shell>;
}
