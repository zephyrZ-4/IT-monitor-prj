import { Shell } from "@/components/shell";
import { TicketLookup } from "@/components/ticket-lookup";
import { defaultTicketType, isTicketType } from "@/lib/ticket-types";

export default async function LookupPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const { type } = await searchParams;
  const initialType = isTicketType(type) ? type : defaultTicketType;
  return <Shell title="工单查询" subtitle="选择工单类型，再用查询编号和工号查看处理状态"><TicketLookup key={initialType} initialType={initialType}/></Shell>;
}
