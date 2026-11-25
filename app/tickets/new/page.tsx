import { Shell } from "@/components/shell";
import { TicketForm } from "@/components/ticket-form";
import { dashboard } from "@/lib/data";
import { defaultTicketType, ticketTypes } from "@/lib/ticket-types";

export const dynamic = "force-dynamic";

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const data = await dashboard();
  const { account = "" } = await searchParams;
  return <Shell title={ticketTypes[defaultTicketType].label} subtitle="申请人可一次提交多个账号或字段的修改需求">
    {!data.batch ? <div className="notice warning">管理员尚未导入用户数据，暂不能提交集群资源工单。</div> : <TicketForm type={defaultTicketType} accounts={data.users} initialAccount={account}/>}
  </Shell>;
}
