import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { TicketDecision } from "@/components/admin-actions";
import { getAdmin } from "@/lib/auth";
import { ticketDetail } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { ticketTypeLabel, ticketTypes } from "@/lib/ticket-types";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) redirect("/admin/login");
  const { id } = await params;
  const result = await ticketDetail(id);
  if (!result) notFound();
  const { ticket, items, applicants } = result;
  const hasItems = ticketTypes[ticket.ticket_type]?.hasItems;
  return <Shell title={ticketTypeLabel(ticket.ticket_type)} subtitle={hasItems ? "审核申请，并在对应源系统手动完成修改" : "审核申请，并在 Polarion 中处理用户账号"} admin>
    <div className="toolbar" style={{ marginBottom: 17 }}><Link className="btn" href={"/admin/tickets?type=" + ticket.ticket_type}>← 返回工单列表</Link></div>
    <div className="card"><div className="card-head"><h2>申请信息</h2><span className="tag warning">{ticket.status}</span></div><div className="card-body"><dl className="detail-list"><div><dt>申请人</dt><dd>{ticket.applicant_name}</dd></div><div><dt>工号</dt><dd>{ticket.employee_id}</dd></div><div><dt>提交时间</dt><dd>{formatDate(ticket.created_at)}</dd></div><div><dt>查询编号</dt><dd>{ticket.tracking_code}</dd></div></dl></div></div>
    {applicants.length > 0 && <div className="card">
      <div className="card-head"><h2>申请人名单</h2><span className="muted">共 {applicants.length} 人</span></div>
      <div className="table-wrap"><table><thead><tr><th>序号</th><th>姓名</th><th>工号</th></tr></thead><tbody>
        {applicants.map(person => <tr key={person.position}><td>{person.position}</td><td>{person.applicant_name}</td><td>{person.employee_id}{person.position === 1 && <span className="usage-partial">用于查询</span>}</td></tr>)}
      </tbody></table></div>
    </div>}
    {hasItems && <div className="card"><div className="card-head"><h2>修改事项</h2><span className="muted">共 {items.length} 项</span></div><div className="table-wrap"><table><thead><tr><th>序号</th><th>账号</th><th>字段</th><th>目录</th><th>期望值</th><th>申请原因</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.position}</td><td>{item.account}</td><td>{item.field}</td><td>{item.volume || "—"}</td><td>{item.requested_value}</td><td style={{ whiteSpace: "normal", minWidth: 180 }}>{item.reason}</td></tr>)}</tbody></table></div></div>}
    <div className="card"><div className="card-head"><h2>处理结果</h2></div><div className="card-body"><div className="notice warning">{hasItems ? "此处只记录处理情况；用户或存储数据将在下一次导入后更新。" : "请先在 Polarion 中处理账号，再在这里记录结果。"}</div><TicketDecision id={id} initialStatus={ticket.status} initialNote={ticket.admin_note}/></div></div>
  </Shell>;
}
