import Link from "next/link";
import type { AnalysisContext } from "@/lib/analysis-service";
import { formatDate } from "@/lib/format";
import { analysisSections } from "@/lib/navigation";

export function analysisParams(filters: AnalysisContext["filters"], changes: Record<string, string> = {}): Record<string, string> {
  return { ...filters, threshold: String(filters.threshold), ...changes };
}

export function analysisUrl(path: string, filters: AnalysisContext["filters"], changes: Record<string, string> = {}): string {
  const params = new URLSearchParams(Object.entries(analysisParams(filters, changes)).filter(([, value]) => value !== ""));
  return `${path}?${params.toString()}`;
}

export function AnalysisTabs({ path, filters }: { path: string; filters: AnalysisContext["filters"] }) {
  return <nav className="analysis-tabs" aria-label="分析页面">
    {analysisSections.map(({ href, label }) => <Link key={href} href={analysisUrl(href, filters)} aria-current={path === href ? "page" : undefined} className={`analysis-tab ${path === href ? "active" : ""}`}>{label}</Link>)}
  </nav>;
}

export function AnalysisControls({ context, path, extra = {} }: { context: AnalysisContext; path: string; extra?: Record<string, string> }) {
  const { filters, batches, groupOptions, statusOptions } = context;
  return <>
    <AnalysisTabs path={path} filters={filters}/>
    <div className="card analysis-filter"><div className="card-head"><h2>分析范围</h2><span className="muted">以下筛选同时作用于指标、趋势和明细</span></div>
      <div className="card-body"><form key={JSON.stringify(filters)} method="get" action={path} className="analysis-filter-grid">
        {Object.entries(extra).filter(([, value]) => value !== "").map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
        <label className="field"><span>数据批次</span><select className="select" name="batch" defaultValue={filters.batch}>{batches.map((batch) => <option key={batch.id} value={batch.id}>{formatDate(batch.imported_at)} · {batch.user_count} 人</option>)}</select></label>
        <label className="field"><span>项目 / 部门</span><select className="select" name="group" defaultValue={filters.group}><option value="">全部</option>{groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        <label className="field"><span>账号状态</span><select className="select" name="status" defaultValue={filters.status}><option value="">全部</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <label className="field"><span>目录</span><select className="select" name="volume" defaultValue={filters.volume}><option value="data">Data</option><option value="home">Home</option></select></label>
        <label className="field"><span>使用率阈值（%）</span><input className="input" type="number" min="0" max="1000" step="1" name="threshold" defaultValue={filters.threshold}/></label>
        <label className="field"><span>账号 / 姓名</span><input className="input" name="q" defaultValue={filters.q} maxLength={200} placeholder="可选关键词"/></label>
        <div className="analysis-filter-actions"><button className="btn primary" type="submit">应用筛选</button><Link className="btn" href={path}>重置</Link></div>
      </form></div>
    </div>
  </>;
}
