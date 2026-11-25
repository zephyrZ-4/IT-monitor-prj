import Link from "next/link";
import { AnalysisTabs } from "@/components/analysis-controls";
import { ExportPanel } from "@/components/export-panel";
import { Shell } from "@/components/shell";
import { activityLabel, activityScopes, activitySorts, observationLabels, queryValue, type ActivityObservation, type ActivitySort, type AnalysisQuery } from "@/lib/activity";
import { loadActivity } from "@/lib/activity-service";
import { signedBytes } from "@/lib/analysis-views";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const path = "/analysis/activity";
const pageSize = 30;

function activityHref(params: Record<string, string>, changes: Record<string, string> = {}, anchor = "") {
  return path + "?" + new URLSearchParams(Object.entries({ ...params, ...changes }).filter(([, value]) => value !== "")) + anchor;
}

function UsageHistory({ points }: { points: ActivityObservation[] }) {
  if (!points.some(point => point.used !== null)) return null;
  const left = 114, right = 816, top = 20, bottom = 164;
  const max = points.reduce((highest, point) => Math.max(highest, point.used ?? 0), 0);
  const x = (i: number) => points.length === 1 ? (left + right) / 2 : left + i * (right - left) / (points.length - 1);
  const y = (used: number) => bottom - (max > 0 ? used / max : 0) * (bottom - top);
  return <svg viewBox="0 0 840 196" className="activity-chart" role="img" aria-label="逐批用量图，缺采处断开；下表列出每个数据点">
    {(max > 0 ? [max, max / 2, 0] : [0]).map(value => <g key={value}>
      <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e4e9ef"/>
      <text x={left - 10} y={y(value) + 4} textAnchor="end">{formatBytes(value, "GB")}</text>
    </g>)}
    {points.map((point, index) => {
      const previous = points[index - 1]?.used;
      if (point.used === null) return <line key={point.batch.id} x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="#d7dfe9" strokeDasharray="4 4"/>;
      const description = "#" + point.batch.id + " · " + formatDate(point.batch.imported_at) + " · " + formatBytes(point.used, "GB");
      return <g key={point.batch.id}>
        {previous != null && <line x1={x(index - 1)} x2={x(index)} y1={y(previous)} y2={y(point.used)} stroke="#2179cf" strokeWidth="2"/>}
        <rect x={x(index) - 3} y={y(point.used) - 3} width="6" height="6" fill="#2179cf"><title>{description}</title></rect>
      </g>;
    })}
    <text x={left} y={188}>#{points[0].batch.id}</text>
    {points.length > 1 && <text x={right} y={188} textAnchor="end">#{points.at(-1)?.batch.id}</text>}
  </svg>;
}

export default async function AccountActivity({ searchParams }: { searchParams: Promise<AnalysisQuery> }) {
  const query = await searchParams;
  const { batches, filters, rows, detail, groupOptions, statusOptions, matching, candidates, incomplete } = await loadActivity(query);
  const volume = filters.volume === "home" ? "Home" : "Data";
  const params = {
    start: filters.start, end: filters.end, volume: filters.volume, group: filters.group, status: filters.status, q: filters.q,
    gb: String(filters.gb), intervals: String(filters.intervals), scope: filters.scope, sort: filters.sort, order: filters.ascending ? "asc" : "desc",
  };
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const requestedPage = Number(queryValue(query, "page"));
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(pages, requestedPage)) : 1;
  const possible = Math.max(0, filters.selected.length - 1);
  const options = batches.map(batch => <option key={batch.id} value={batch.id}>#{batch.id} · {formatDate(batch.imported_at)} · {batch.user_count} 人</option>);
  const endIndex = batches.findIndex(batch => batch.id === filters.end);
  const sortable = (key: ActivitySort, label: string) => <th aria-sort={filters.sort === key ? filters.ascending ? "ascending" : "descending" : "none"}>
    <Link className={filters.sort === key ? "sort-active" : ""} href={activityHref(params, { sort: key, order: filters.sort === key ? filters.ascending ? "desc" : "asc" : key === "streak" || key === "coverage" ? "desc" : "asc" })}>
      {label}{filters.sort === key ? filters.ascending ? " ↑" : " ↓" : ""}
    </Link>
  </th>;
  return <Shell title="账号用量活跃度" subtitle="比较任意导入区间内的逐批用量，查找值得进一步核查的账号">
    <AnalysisTabs path={path} filters={{ batch: filters.end, group: filters.group, status: filters.status, volume: filters.volume, threshold: 80, q: filters.q }}/>
    {!batches.length ? <div className="card"><div className="empty">还没有导入数据。请先上传源文件。</div></div> : <>
      <div className="card analysis-filter">
        <div className="card-head"><h2>用量分析范围</h2><span className="muted">包含起止批次及中间每一次导入</span></div>
        <div className="card-body"><form method="get" action={path} key={JSON.stringify(params)} className="analysis-filter-grid">
          <label className="field"><span>起始批次</span><select className="select" name="start" defaultValue={filters.start}>{options}</select></label>
          <label className="field"><span>结束批次</span><select className="select" name="end" defaultValue={filters.end}>{options}</select></label>
          <label className="field"><span>目录</span><select className="select" name="volume" defaultValue={filters.volume}><option value="data">Data</option><option value="home">Home</option></select></label>
          <label className="field"><span>项目 / 部门</span><select className="select" name="group" defaultValue={filters.group}><option value="">全部</option>{groupOptions.map(group => <option key={group}>{group}</option>)}</select></label>
          <label className="field"><span>账号状态</span><select className="select" name="status" defaultValue={filters.status}><option value="">全部</option>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="field"><span>账号 / 姓名</span><input className="input" name="q" defaultValue={filters.q} maxLength={200} placeholder="可选关键词"/></label>
          <label className="field"><span>每次低变化不超过（GB）</span><input className="input" name="gb" type="number" min="0" max="1000000" step="any" defaultValue={filters.gb}/></label>
          <label className="field"><span>至少连续低变化次数</span><input className="input" name="intervals" type="number" min="1" max="9999" defaultValue={filters.intervals}/></label>
          <input type="hidden" name="scope" value={filters.scope}/><input type="hidden" name="sort" value={filters.sort}/><input type="hidden" name="order" value={params.order}/>
          <div className="analysis-filter-actions toolbar"><button className="btn primary" type="submit">应用筛选</button><Link className="btn" href={path}>重置</Link>
            {batches.length > 1 && [3, 5, 10].map(count => <Link className="btn" key={count} href={activityHref(params, { start: batches[Math.min(batches.length - 1, endIndex + count - 1)].id })}>截至结束批次最近 {count} 批</Link>)}
          </div>
        </form></div>
      </div>
      <div className="notice">用量变化只反映两次导入间的净增减。逐批变化总量把相邻批次的增减取绝对值后相加；缺采不记成零，也不跨批补算。待复核要求区间采集完整，且结束批次往前连续达到低变化要求。用量平稳不能证明账号没有登录或运行任务。</div>
      {possible === 0 ? <div className="notice warning">当前范围只有 1 批数据。请选择不同的起止批次；如果目前只导入过一次，需等下一次成功导入后才能比较。</div> :
        filters.intervals > possible && <div className="notice warning">当前范围最多可比较 {possible} 次，少于设定的连续 {filters.intervals} 次。扩大范围或调低次数后可筛选待复核账号。</div>}
      <div className="analysis-metrics comparison-metrics">
        <div className="analysis-metric"><span>所选批次 · {volume}</span><strong>{filters.selected.length}</strong><small>最多可比较 {possible} 次</small></div>
        <div className="analysis-metric"><span>符合账号筛选</span><strong>{matching}</strong><small>包含区间内出现过的账号</small></div>
        <div className="analysis-metric"><span>待复核账号</span><strong>{candidates}</strong><small>连续 ≥ {filters.intervals} 次 · 每次 ≤ {filters.gb} GB</small></div>
        <div className="analysis-metric"><span>采集不完整</span><strong>{incomplete}</strong><small>包括用量缺采或账号未出现在某批次</small></div>
      </div>
      <ExportPanel key={JSON.stringify(params)} view="activity" query={params} accounts={rows.map(({ account, name }) => ({ account, name }))}/>
      <div className="card">
        <div className="card-head"><h2>账号用量活跃度</h2><span className="muted">{rows.length} 个账号 · 第 {page}/{pages} 页</span></div>
        <nav className="analysis-choices" aria-label="活跃度结果范围">{activityScopes.map(([key, label]) => <Link key={key} aria-current={filters.scope === key ? "page" : undefined} className={"analysis-choice" + (filters.scope === key ? " active" : "")} href={activityHref(params, { scope: key })}>{label}</Link>)}</nav>
        <div className="table-wrap"><table><thead><tr><th>账号 / 姓名</th><th>项目 / 部门</th><th>账号状态</th><th>起始用量</th>{sortable("last", "结束用量")}{sortable("net", "起止用量差")}{sortable("movement", "逐批变化总量")}{sortable("coverage", "有效比较")}{sortable("streak", "连续低变化") }<th>复核状态</th><th>操作</th></tr></thead><tbody>
          {rows.slice((page - 1) * pageSize, page * pageSize).map(row => {
            const detailHref = activityHref(params, { account: row.account, page: String(page) }, "#activity-detail");
            return <tr key={row.account}>
              <td><Link className="link strong-link" href={detailHref}>{row.account}</Link>{row.name && <span className="muted"> · {row.name}</span>}</td>
              <td>{row.department || "—"}</td><td>{row.status || "—"}</td><td>{formatBytes(row.firstUsed, "GB")}</td><td>{formatBytes(row.lastUsed, "GB")}</td>
              <td className="mono">{signedBytes(row.net, "GB")}</td><td className="mono">{row.movement === null ? "—" : formatBytes(row.movement, "GB")}{row.movement !== null && !row.complete && <span className="usage-partial">部分</span>}</td>
              <td>{row.comparable}/{possible}<small className="activity-coverage">采集 {row.observed}/{filters.selected.length} 批</small></td>
              <td>{row.comparable ? row.streak + " 次" : "—"}</td><td><span className={"tag " + (row.candidate ? "warning" : "info")}>{activityLabel(row)}</span></td>
              <td><Link className="link" href={detailHref}>逐批明细</Link></td>
            </tr>;
          })}
        </tbody></table>{!rows.length && <div className="empty">没有符合当前条件的账号</div>}</div>
        {pages > 1 && <nav className="analysis-pagination" aria-label="账号列表分页">{page > 1 && <Link className="btn" href={activityHref(params, { page: String(page - 1) })}>上一页</Link>}{page < pages && <Link className="btn" href={activityHref(params, { page: String(page + 1) })}>下一页</Link>}</nav>}
      </div>
      {detail && <section className="card" id="activity-detail">
        <div className="card-head"><h2>{detail.account} · {detail.name || "逐批明细"} · {volume}</h2><Link className="btn" href={activityHref(params, { page: String(page) })}>关闭明细</Link></div>
        <div className="card-body"><UsageHistory points={detail.points}/></div>
        <div className="table-wrap"><table><thead><tr><th>导入批次</th><th>导入时间</th><th>采集情况</th><th>已用</th><th>较前一批变化</th></tr></thead><tbody>
          {detail.points.map(point => <tr key={point.batch.id}><td>#{point.batch.id}</td><td>{formatDate(point.batch.imported_at)}</td><td>{observationLabels[point.state]}</td><td>{point.used === null ? "—" : formatBytes(point.used, "GB")}</td><td>{signedBytes(point.delta, "GB")}</td></tr>)}
        </tbody></table></div>
      </section>}
      <p className="analysis-footnote">姓名、部门和账号状态取该账号在区间内最后出现的批次；日期为北京时间。相邻批次的间隔可能不同。</p>
    </>}
  </Shell>;
}
