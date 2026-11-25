import Link from "next/link";
import { Shell } from "@/components/shell";
import { AnalysisControls, analysisParams, analysisUrl } from "@/components/analysis-controls";
import { MissingUsageBadge } from "@/components/analysis-tables";
import { loadAnalysis } from "@/lib/analysis-service";
import { changeKinds, changeSorts, changesView, signedBytes as delta } from "@/lib/analysis-views";
import { ExportPanel } from "@/components/export-panel";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryChanges({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const context = await loadAnalysis(query);
  const { batch, filters } = context;
  const { older, compare, currentMetrics, beforeMetrics, accountChanges, groupChanges, kind, sort, ascending } = changesView(context, query);
  const viewParams = { compare: compare?.id ?? "", kind, sort, order: ascending ? "asc" : "desc" };
  const exportQuery = analysisParams(filters, viewParams);
  const makeCompareUrl = (id: string) => analysisUrl("/analysis/changes", filters, { ...viewParams, compare: id });
  return <Shell title="历史变化" subtitle="比较两批真实导入，定位项目和账号的配额、用量与资料变化">
    {!batch ? <div className="card"><div className="empty">暂无可分析的导入数据</div></div> : <>
      <AnalysisControls context={context} path="/analysis/changes" extra={viewParams}/>
      {!compare ? <div className="card"><div className="empty"><strong>所选批次没有更早的对比批次</strong><p>选择一个较新的批次，或等下一次成功导入后再比较。</p></div></div> : <>
        <div className="card"><div className="card-head"><h2>对比批次</h2><span className="muted">当前批次与较早批次</span></div><div className="card-body"><div className="analysis-choices inline-choices"><span>当前：{formatDate(batch.imported_at)}</span><span>对比：</span>{older.map((item) => <Link key={item.id} className={`analysis-choice ${compare.id === item.id ? "active" : ""}`} href={makeCompareUrl(item.id)}>{formatDate(item.imported_at)}</Link>)}</div></div></div>
        <div className="toolbar change-activity-link"><Link className="btn" href={analysisUrl("/analysis/activity", filters, { start: compare.id, end: batch.id })}>查看这段区间的账号用量活跃度</Link></div>
        <ExportPanel key={JSON.stringify(exportQuery)} view="changes" query={exportQuery} accounts={accountChanges.map(({ account, name }) => ({ account, name }))}/>
        <div className="analysis-metrics comparison-metrics">
          <div className="analysis-metric"><span>账号数变化</span><strong>{currentMetrics.accounts - beforeMetrics.accounts > 0 ? "+" : ""}{currentMetrics.accounts - beforeMetrics.accounts}</strong><small>{beforeMetrics.accounts} → {currentMetrics.accounts} 个</small></div>
          <div className="analysis-metric"><span>分配限额变化</span><strong>{delta(currentMetrics.limitBytes - beforeMetrics.limitBytes)}</strong><small>{formatBytes(beforeMetrics.limitBytes, "TB")} → {formatBytes(currentMetrics.limitBytes, "TB")}</small></div>
          <div className="analysis-metric"><span>已采集用量变化</span><strong>{delta(currentMetrics.knownUsedBytes - beforeMetrics.knownUsedBytes)}</strong><small>仅比较两批已知用量；需结合覆盖率</small></div>
          <div className="analysis-metric"><span>完整采集账号变化</span><strong>{currentMetrics.collected - beforeMetrics.collected > 0 ? "+" : ""}{currentMetrics.collected - beforeMetrics.collected}</strong><small>{beforeMetrics.collected}/{beforeMetrics.accounts} → {currentMetrics.collected}/{currentMetrics.accounts}</small></div>
        </div>
        <div className="card"><div className="card-head"><h2>项目 / 部门变化</h2><span className="muted">按照每批当时归属统计</span></div><div className="table-wrap"><table><thead><tr><th>项目 / 部门</th><th>账号数</th><th>账号变化</th><th>当前限额</th><th>限额变化</th><th>当前已采集用量</th><th>已用变化</th><th>当前采集覆盖</th></tr></thead><tbody>{groupChanges.map(({ group, current, previous }) => <tr key={group}><td>{group}</td><td>{current?.accounts ?? 0}</td><td>{(current?.accounts ?? 0) - (previous?.accounts ?? 0)}</td><td className="mono">{formatBytes(current?.limitBytes ?? 0, "TB")}</td><td className="mono">{delta((current?.limitBytes ?? 0) - (previous?.limitBytes ?? 0))}</td><td className="mono">{formatBytes(current?.knownUsedBytes ?? 0, "TB")}<MissingUsageBadge count={current?.missingUsage ?? 0}/></td><td className="mono">{delta((current?.knownUsedBytes ?? 0) - (previous?.knownUsedBytes ?? 0))}</td><td>{current?.collected ?? 0}/{current?.accounts ?? 0}</td></tr>)}</tbody></table></div></div>
        <div className="card"><div className="card-head"><h2>发生变化的账号</h2><span className="muted">{accountChanges.length} 个账号 · 两批均采集到用量时才计算差值</span></div>
          <div className="card-body"><form key={JSON.stringify(exportQuery)} className="toolbar history-sort" method="get" action="/analysis/changes">
            {Object.entries(exportQuery).filter(([key, value]) => !["kind", "sort", "order"].includes(key) && value).map(([key, value]) => <input type="hidden" key={key} name={key} value={value}/>)}
            <label className="field"><span>变化类型</span><select className="select" name="kind" defaultValue={kind}><option value="">全部</option>{Object.entries(changeKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="field"><span>排序指标</span><select className="select" name="sort" defaultValue={sort}>{changeSorts.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="field"><span>顺序</span><select className="select" name="order" defaultValue={viewParams.order}><option value="asc">升序</option><option value="desc">降序</option></select></label>
            <button type="submit" className="btn primary">应用</button>
          </form></div>
          <div className="table-wrap"><table><thead><tr><th>账号</th><th>用户名称</th><th>变化内容</th><th>已用净变化</th><th>当前限额</th><th>当前已用</th></tr></thead><tbody>{accountChanges.map((item) => <tr key={item.account}><td><Link className="link" href={`/users/${encodeURIComponent(item.account)}?batch=${encodeURIComponent(item.current ? batch.id : compare.id)}`}>{item.account}</Link></td><td>{item.name}</td><td className="change-detail">{item.detail.join("；")}</td><td className="mono">{delta(item.usedDelta, "GB")}</td><td>{item.current ? formatBytes(item.current.limitBytes, "GB") : "—"}</td><td>{item.current?.usedBytes == null ? "未采集完整" : formatBytes(item.current.usedBytes, "GB")}</td></tr>)}</tbody></table>{!accountChanges.length && <div className="empty">两批之间没有符合当前筛选条件的账号变化</div>}</div></div>
        <div className="analysis-footnote">账号进入或离开当前筛选范围，可能由项目归属、状态、搜索条件变化造成；不能直接视为账号创建或删除。已用合计为已采集部分，覆盖率变化可能影响增减值。</div>
      </>}
    </>}
  </Shell>;
}
