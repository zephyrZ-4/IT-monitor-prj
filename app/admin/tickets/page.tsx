import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { ExportPanel } from "@/components/export-panel";
import { getAdmin } from "@/lib/auth";
import { tickets } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { isTicketType, ticketStatuses, ticketTypeEntries, ticketTypeLabel, ticketTypes, type TicketType } from "@/lib/ticket-types";

export const dynamic = "force-dynamic";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; type?: string | string[] }> }) {
  if (!(await getAdmin())) redirect("/admin/login");
  const query = await searchParams;
  const type = isTicketType(query.type) ? query.type : "";
  const status = ticketStatuses.find(value => value === query.status) ?? "";
  const rows = await tickets(status, type);
  const showItems = !type || ticketTypes[type].hasItems;
  const showApplicants = !type || type === "polarion-user";
  const href = (nextType: TicketType | "", nextStatus: string) => "/admin/tickets?" + new URLSearchParams({
    ...(nextType ? { type: nextType } : {}), ...(nextStatus ? { status: nextStatus } : {}),
  });
  return <Shell title="工单处理" subtitle="按工单类型查看和处理申请" admin>
    <nav className="analysis-tabs" aria-label="工单类型">
      <Link className={"analysis-tab" + (!type ? " active" : "")} aria-current={!type ? "page" : undefined} href={href("", status)}>全部类型</Link>
      {ticketTypeEntries.map(([value, entry]) => <Link key={value} className={"analysis-tab" + (type === value ? " active" : "")} aria-current={type === value ? "page" : undefined} href={href(value, status)}>{entry.label}</Link>)}
    </nav>
    <ExportPanel key={type + ":" + status} view="tickets" query={{ status, type }}/>
    <div className="card">
      <div className="card-head"><h2>{type ? ticketTypeLabel(type) : "工单列表"}</h2><nav className="toolbar" aria-label="工单状态">
        {["", ...ticketStatuses].map(value => <Link key={value} className={"btn" + (status === value ? " primary" : "")} aria-current={status === value ? "page" : undefined} href={href(type, value)}>{value || "全部状态"}</Link>)}
      </nav></div>
      <div className="table-wrap"><table><thead><tr><th>提交时间</th><th>工单类型</th><th>{type === "polarion-user" ? "首位申请人" : "申请人"}</th><th>工号</th>{showItems && <th>事项数</th>}{showApplicants && <th>申请人数</th>}<th>状态</th><th>操作</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>{formatDate(row.created_at)}</td><td>{ticketTypeLabel(row.ticket_type)}</td><td>{row.applicant_name}</td><td>{row.employee_id}</td>
          {showItems && <td>{ticketTypes[row.ticket_type]?.hasItems ? row.item_count : "—"}</td>}
          {showApplicants && <td>{row.applicant_count ?? "—"}</td>}
          <td><span className={`tag ${row.status === "已驳回" ? "danger" : row.status === "待处理" ? "warning" : ""}`}>{row.status}</span></td>
          <td><Link className="link" href={`/admin/tickets/${row.id}`}>查看处理</Link></td>
        </tr>)}</tbody>
      </table>{rows.length === 0 && <div className="empty">没有符合当前筛选条件的工单</div>}</div>
    </div>
  </Shell>;
}
