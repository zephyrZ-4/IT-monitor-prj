import Link from "next/link";
import { Shell } from "@/components/shell";
import { AnalysisControls, analysisParams, analysisUrl } from "@/components/analysis-controls";
import { ExportPanel } from "@/components/export-panel";
import { AnalysisChart } from "@/components/analysis-chart";
import { GroupTable, AnalysisUserTable } from "@/components/analysis-tables";
import { loadAnalysis } from "@/lib/analysis-service";
import { enrichUsers, metrics } from "@/lib/analytics";
import { formatBytes, formatDate, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AnalysisOverview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await loadAnalysis(await searchParams);
  const { batch, filters, summary, groups, selected, previous, unlinked } = context;
  const data = metrics(enrichUsers(selected, [], "data"), filters.threshold);
  const home = metrics(enrichUsers(selected, [], "home"), filters.threshold);
  const topGroups = groups.filter(group => !filters.group || filters.group === group.group).sort((a, b) => b.limitBytes - a.limitBytes);
  const topUsers = [...selected].sort((a, b) => b.limitBytes - a.limitBytes).slice(0, 8);
  const shared = unlinked.filter((row) => row.shared);
  const unmatched = unlinked.filter((row) => !row.shared);
  return <Shell title="分析总览" subtitle="从项目、容量、使用情况和账号异常理解当前快照">
    {!batch ? <div className="card"><div className="empty">尚无导入数据。请管理员上传三份源文件。</div></div> : <>
      <AnalysisControls context={context} path="/analysis"/>
      <ExportPanel key={JSON.stringify(filters)} view="overview" query={analysisParams(filters)} accounts={selected.map(({ account, name }) => ({ account, name }))}/>
      <div className="analysis-context-line">当前批次：<strong>{formatDate(batch.imported_at)}</strong> · {filters.volume === "data" ? "Data" : "Home"} · {filters.group || "全部项目 / 部门"} · {summary.accounts} 个账号</div>
      <div className="analysis-metrics">
        <div className="analysis-metric"><span>账号数</span><strong>{summary.accounts}</strong><small>正常 {summary.normal} · 已停用 {summary.stopped}</small></div>
        <div className="analysis-metric"><span>所选目录限额</span><strong>{formatBytes(summary.limitBytes, "TB")}</strong><small>Data {formatBytes(data.limitBytes, "TB")} · Home {formatBytes(home.limitBytes, "TB")}</small></div>
        <div className="analysis-metric"><span>所选目录已采集用量</span><strong>{formatBytes(summary.knownUsedBytes, "TB")}</strong><small>Data {formatBytes(data.knownUsedBytes, "TB")} · Home {formatBytes(home.knownUsedBytes, "TB")}</small></div>
        <div className="analysis-metric"><span>已采集账号使用率</span><strong>{formatPercent(summary.utilization)}</strong><small>完整采集 {summary.collected}/{summary.accounts} 个账号</small></div>
        <div className="analysis-metric"><span>达到 {filters.threshold}% 的账号</span><strong>{summary.thresholdCount}</strong><small>超过限额 {summary.overLimit} 个</small></div>
        <div className="analysis-metric"><span>资料待核查</span><strong>{summary.mismatch + summary.actualMissing}</strong><small>使用人不一致 {summary.mismatch} · 未填写 {summary.actualMissing}</small></div>
      </div>
      {summary.missingUsage > 0 && <div className="notice warning">{summary.missingUsage} 个账号在所选目录的用量未采集完整。“已采集用量合计”为已知部分；使用率仅按完整采集的账号计算。</div>}
      <div className="grid-2 analysis-main-grid">
        <div className="card"><div className="card-head"><h2>限额与用量趋势</h2><span className="muted">按各批次当时的所属部门统计</span></div><div className="card-body"><AnalysisChart points={context.trend}/></div></div>
        <div className="card"><div className="card-head"><h2>管理关注项</h2><Link className="link" href={analysisUrl("/analysis/rankings", filters)}>查看全部</Link></div><div className="analysis-risk-list">
          <Link href={analysisUrl("/analysis/rankings", filters, { issue: "stopped" })}><span>已停用账号</span><strong>{summary.stopped}</strong></Link>
          <Link href={analysisUrl("/analysis/rankings", filters, { issue: "mismatch" })}><span>名称与实际使用人不一致</span><strong>{summary.mismatch}</strong></Link>
          <Link href={analysisUrl("/analysis/rankings", filters, { issue: "blank" })}><span>实际使用人未填写</span><strong>{summary.actualMissing}</strong></Link>
          <Link href={analysisUrl("/analysis/rankings", filters, { issue: "threshold" })}><span>使用率达到 {filters.threshold}%</span><strong>{summary.thresholdCount}</strong></Link>
          <Link href={analysisUrl("/analysis/rankings", filters, { issue: "missing" })}><span>用量未采集完整</span><strong>{summary.missingUsage}</strong></Link>
          <div><span>共享 / 未关联存储记录（全批次）</span><strong>{shared.length} / {unmatched.length}</strong></div>
        </div></div>
      </div>
      <div className="card"><div className="card-head"><h2>项目 / 部门限额排行</h2><Link className="link" href={analysisUrl("/analysis/projects", filters)}>查看完整汇总</Link></div><GroupTable groups={topGroups} context={context} compact/></div>
      <div className="card"><div className="card-head"><h2>限额最高的账号</h2><Link className="link" href={analysisUrl("/analysis/rankings", filters, { sort: "limit" })}>查看完整排行</Link></div><AnalysisUserTable users={topUsers} batchId={batch.id}/></div>
      <div className="analysis-footnote">限额是账号配额之和，不代表存储设备已预留的物理容量。共享用量不分摊给个人或项目。{previous ? `上一个可对比批次：${formatDate(previous.imported_at)}。` : "当前仅有一批真实数据，历史变化待后续导入。"}</div>
    </>}
  </Shell>;
}
