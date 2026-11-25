import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ExportPanel } from "@/components/export-panel";
import { TrendChart } from "@/components/trend-chart";
import { UsageBar } from "@/components/usage-bar";
import { userDetail } from "@/lib/data";
import { formatBytes, formatDate, formatPercent, utilization } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UserPage({ params, searchParams }: { params: Promise<{ account: string }>; searchParams: Promise<{ batch?: string }> }) {
  const { account } = await params;
  const { batch } = await searchParams;
  const data = await userDetail(account, batch);
  if (!data) notFound();
  const { user, history } = data;
  return <Shell title="用户详情" subtitle={`账号 ${user.account} 在 ${formatDate(data.batch.imported_at)} 的数据与此前趋势`}>
    <ExportPanel key={user.account + ":" + data.batch.id} view="user" query={{ account: user.account, batch: data.batch.id }}/>
    <div className="toolbar" style={{ marginBottom: 17 }}><Link className="btn" href={batch ? `/analysis?batch=${encodeURIComponent(batch)}` : "/"}>← 返回总览</Link>{data.isLatest && <Link className="btn primary" href={`/tickets/new?account=${encodeURIComponent(user.account)}`}>申请修改</Link>}</div>
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>用户信息</h2><span className="tag">{user.status}</span></div><div className="card-body"><dl className="detail-list"><div><dt>用户账号</dt><dd>{user.account}</dd></div><div><dt>用户名称</dt><dd>{user.name || "—"}</dd></div><div><dt>所属部门</dt><dd>{user.department || "—"}</dd></div><div><dt>实际使用人</dt><dd>{user.actual_user || "—"}</dd></div></dl></div></div>
      <div className="card"><div className="card-head"><h2>所选批次配额</h2><span className="muted">{formatDate(data.batch.imported_at)}</span></div><div className="card-body"><div style={{ display: "grid", gap: 18 }}>
        {(["data", "home"] as const).map((volume) => { const used = volume === "data" ? user.data_used : user.home_used; const limit = volume === "data" ? user.data_limit : user.home_limit; const percent = utilization(used, limit); return <div key={volume}><div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 9 }}><b>{volume.toUpperCase()}</b><span>{formatBytes(used)} / {formatBytes(limit)}</span></div><UsageBar percent={percent}/></div>; })}
      </div></div></div>
    </div>
    <div className="grid-2"><div className="card"><div className="card-head"><h2>Data 用量趋势</h2><span className="muted">最近 30 次导入</span></div><div className="card-body"><TrendChart points={history.map((row) => ({ date: row.imported_at, bytes: row.data_used }))}/></div></div><div className="card"><div className="card-head"><h2>Home 用量趋势</h2><span className="muted">最近 30 次导入</span></div><div className="card-body"><TrendChart color="home" points={history.map((row) => ({ date: row.imported_at, bytes: row.home_used }))}/></div></div></div>
    <div className="card"><div className="card-head"><h2>历史快照</h2><span className="muted">可查看资料与配额变化</span></div><div className="table-wrap"><table><thead><tr><th>导入时间</th><th>所属部门</th><th>状态</th><th>实际使用人</th><th>Data 已用</th><th>Data 限额</th><th>Data 使用率</th><th>Home 已用</th><th>Home 限额</th><th>Home 使用率</th></tr></thead><tbody>{[...history].reverse().map((row) => <tr key={row.id}><td>{formatDate(row.imported_at)}</td><td>{row.department || "—"}</td><td>{row.status || "—"}</td><td>{row.actual_user || "—"}</td><td>{formatBytes(row.data_used)}</td><td>{formatBytes(row.data_limit)}</td><td>{formatPercent(utilization(row.data_used, row.data_limit))}</td><td>{formatBytes(row.home_used)}</td><td>{formatBytes(row.home_limit)}</td><td>{formatPercent(utilization(row.home_used, row.home_limit))}</td></tr>)}</tbody></table></div></div>
  </Shell>;
}
