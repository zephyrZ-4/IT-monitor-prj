import Link from "next/link";
import { Shell } from "@/components/shell";
import { UserTable } from "@/components/user-table";
import { ExportPanel } from "@/components/export-panel";
import { queryValue, type AnalysisQuery } from "@/lib/activity";
import { dashboard } from "@/lib/data";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<AnalysisQuery> }) {
  const q = queryValue(await searchParams, "q").slice(0, 200);
  const data = await dashboard(q);
  return <Shell title="数据总览" subtitle="软件用户、存储用量与配额统一查询">
    {!data.batch ? <div className="card"><div className="empty">尚无导入数据。请管理员先上传三份文件。<p><Link className="link" href="/admin">前往管理员页面</Link></p></div></div> : <>
      <div className="stats">
        <div className="stat-card"><span className="stat-icon">♙</span><div><div className="stat-label">软件用户</div><div className="stat-value">{data.stats.users}</div><div className="stat-note">最新批次账号数</div></div></div>
        <div className="stat-card"><span className="stat-icon green">▰</span><div><div className="stat-label">Data 已用</div><div className="stat-value">{formatBytes(data.stats.dataUsed, "TB")}</div><div className="stat-note">已关联账号合计</div></div></div>
        <div className="stat-card"><span className="stat-icon purple">▰</span><div><div className="stat-label">Home 已用</div><div className="stat-value">{formatBytes(data.stats.homeUsed, "TB")}</div><div className="stat-note">已关联账号合计</div></div></div>
        <div className="stat-card"><span className="stat-icon orange">!</span><div><div className="stat-label">接近或超过限额</div><div className="stat-value">{data.stats.nearLimit}</div><div className="stat-note">任一目录使用率 ≥ 80%</div></div></div>
      </div>
      <div className="notice">最新导入：{formatDate(data.batch.imported_at)} · {data.batch.user_count} 个用户 · {data.batch.warnings.length} 条导入提示。容量按 1024 进制换算。</div>
      <div className="card"><div className="card-head"><h2>查询筛选</h2><span className="muted">按账号、姓名、部门或实际使用人查找</span></div><div className="card-body"><form className="toolbar" method="get"><input className="input" name="q" defaultValue={q} maxLength={200} placeholder="请输入关键词"/><button className="btn primary" type="submit">查询</button><Link className="btn" href="/">重置</Link></form></div></div>
      <ExportPanel key={data.batch.id + ":" + q} view="dashboard" query={{ q, batch: data.batch.id }} accounts={data.users.map(({ account, name }) => ({ account, name }))}/>
      <div className="card"><UserTable key={q} users={data.users}/></div>
      {data.shared.length > 0 && <div className="card"><div className="card-head"><h2>共享用量记录</h2><span className="tag warning">不分摊到个人</span></div><div className="table-wrap"><table><thead><tr><th>存储用户字段</th><th>目录</th><th>已用空间</th><th>报告使用率</th><th>说明</th></tr></thead><tbody>{data.shared.map((row) => <tr key={`${row.account}-${row.volume}`}><td>{row.account}</td><td>{row.volume}</td><td>{formatBytes(row.used_bytes, "GB")}</td><td>{row.hard_percent === null ? "—" : `${row.hard_percent}%`}</td><td>独立展示，限额以明确规则为准</td></tr>)}</tbody></table></div></div>}
      {data.unmatched.length > 0 && <div className="card"><div className="card-head"><h2>未关联存储记录</h2><span className="muted">未计入软件用户汇总</span></div><div className="table-wrap"><table><thead><tr><th>存储用户字段</th><th>目录</th><th>已用空间</th></tr></thead><tbody>{data.unmatched.map((row) => <tr key={`${row.account}-${row.volume}`}><td>{row.account}</td><td>{row.volume}</td><td>{formatBytes(row.used_bytes)}</td></tr>)}</tbody></table></div></div>}
    </>}
  </Shell>;
}
