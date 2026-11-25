import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { LogoutButton, UploadForm } from "@/components/admin-actions";
import { getAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { recentBatches, ticketCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const [batches, counts] = await Promise.all([recentBatches(), ticketCounts()]);
  return <Shell title="数据导入" subtitle={`管理员 ${admin.username} · 三文件联合导入`} admin>
    <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 16 }}><Link className="btn" href="/admin/tickets">待处理工单 {counts.pending}</Link><LogoutButton/></div>
    <div className="card"><div className="card-head"><h2>创建数据快照</h2><span className="tag info">仅管理员</span></div><div className="card-body"><UploadForm/></div></div>
    <div className="card"><div className="card-head"><h2>最近导入</h2><span className="muted">共 {batches.length} 条最近记录</span></div><div className="table-wrap"><table><thead><tr><th>批次</th><th>导入时间</th><th>用户数</th><th>用量行数</th><th>规则数</th><th>提示</th><th>源文件</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>#{batch.id}</td><td>{formatDate(batch.imported_at)}</td><td>{batch.user_count}</td><td>{batch.usage_count}</td><td>{batch.rule_count}</td><td><span className={`tag ${batch.warnings.length ? "warning" : ""}`}>{batch.warnings.length} 条</span></td><td><details><summary>查看文件名</summary><div>{batch.software_filename}<br/>{batch.usage_filename}<br/>{batch.rules_filename}</div></details></td></tr>)}</tbody></table>{batches.length === 0 && <div className="empty">尚无导入记录</div>}</div></div>
  </Shell>;
}
