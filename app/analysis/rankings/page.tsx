import Link from "next/link";
import { Shell } from "@/components/shell";
import { AnalysisControls, analysisParams, analysisUrl } from "@/components/analysis-controls";
import { ExportPanel } from "@/components/export-panel";
import { AnalysisUserTable } from "@/components/analysis-tables";
import { loadAnalysis } from "@/lib/analysis-service";
import type { Ranking } from "@/lib/analytics";
import { rankingIssues as issues, rankingsView } from "@/lib/analysis-views";

export const dynamic = "force-dynamic";

export default async function Rankings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const context = await loadAnalysis(query);
  const { filters, batch, previous } = context;
  const { issue, sort, ascending, ranked } = rankingsView(context, query);
  const exportQuery = analysisParams(filters, { issue, sort, order: ascending ? "asc" : "desc" });
  const pageValue = typeof query.page === "string" ? Number(query.page) : 1;
  const pages = Math.max(1, Math.ceil(ranked.length / 50));
  const page = Number.isSafeInteger(pageValue) ? Math.min(pages, Math.max(1, pageValue)) : 1;
  const visible = ranked.slice((page - 1) * 50, page * 50);
  const sortLink = (key: Ranking, label: string) => <Link className={`analysis-choice ${sort === key ? "active" : ""}`} href={analysisUrl("/analysis/rankings", filters, { issue, sort: key, order: "desc" })}>{label}</Link>;
  return <Shell title="账号排行与异常" subtitle="按配额、实际使用、使用率和增长量排序，定位需要核查的账号">
    {!batch ? <div className="card"><div className="empty">暂无可分析的导入数据</div></div> : <>
      <AnalysisControls context={context} path="/analysis/rankings" extra={{ issue, sort, order: exportQuery.order }}/>
      <div className="card"><div className="card-head"><h2>核查类别</h2><span className="muted">使用率阈值：{filters.threshold}%</span></div><div className="analysis-choices">{issues.map(([key, label]) => <Link key={key} className={`analysis-choice ${issue === key ? "active" : ""}`} href={analysisUrl("/analysis/rankings", filters, { issue: key, sort })}>{label}</Link>)}</div></div>
      <div className="card"><div className="card-head"><h2>排序指标</h2><span className="muted">按照原始字节数和实际比率排序</span></div><div className="analysis-choices">{sortLink("limit", "限额从大到小")}{sortLink("used", "已用从大到小")}{sortLink("utilization", "使用率从高到低")}{sortLink("growth", "较上批增长量")}</div></div>
      {sort === "growth" && !previous && <div className="notice warning">目前只有一批真实数据，增长排行需要下一次成功导入。</div>}
      {issue === "lowuse" && <div className="notice">“大限额低使用”定义为：所选目录限额 ≥ 1 TB，且已采集使用率 &lt; 10%。这表示空间配额使用较少，不代表账号长期未登录。</div>}
      <ExportPanel key={JSON.stringify(exportQuery)} view="rankings" query={exportQuery} accounts={ranked.map(({ account, name }) => ({ account, name }))}/>
      <div className="card"><div className="card-head"><h2>{issues.find(([key]) => key === issue)?.[1]} · {ranked.length} 个账号</h2><div className="toolbar"><Link className={`btn ${ascending ? "primary" : ""}`} href={analysisUrl("/analysis/rankings", filters, { issue, sort, order: ascending ? "desc" : "asc" })}>{ascending ? "升序 ↑" : "降序 ↓"}</Link><span className="muted">第 {page}/{pages} 页</span></div></div><AnalysisUserTable users={visible} showGrowth batchId={batch.id}/>
        {pages > 1 && <div className="analysis-pagination">{page > 1 && <Link className="btn" href={analysisUrl("/analysis/rankings", filters, { issue, sort, order: ascending ? "asc" : "desc", page: String(page - 1) })}>上一页</Link>}{page < pages && <Link className="btn" href={analysisUrl("/analysis/rankings", filters, { issue, sort, order: ascending ? "asc" : "desc", page: String(page + 1) })}>下一页</Link>}</div>}
      </div>
    </>}
  </Shell>;
}
