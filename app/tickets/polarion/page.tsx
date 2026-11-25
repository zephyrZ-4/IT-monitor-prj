import { Shell } from "@/components/shell";
import { TicketForm } from "@/components/ticket-form";
import { ticketTypes } from "@/lib/ticket-types";

export default function PolarionTicketPage() {
  return <Shell title={ticketTypes["polarion-user"].label} subtitle="填写姓名和工号，可在同一张工单中为多人申请 Polarion 账号">
    <TicketForm type="polarion-user"/>
  </Shell>;
}
