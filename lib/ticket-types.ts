export const ticketTypes = {
  "cluster-resource": { label: "集群资源工单", href: "/tickets/new", icon: "▤", hasItems: true },
  "polarion-user": { label: "Polarion 用户申请工单", href: "/tickets/polarion", icon: "♙", hasItems: false },
} as const;

export type TicketType = keyof typeof ticketTypes;
export const defaultTicketType: TicketType = "cluster-resource";
export const MAX_POLARION_APPLICANTS = 10;
export const ticketStatuses = ["待处理", "处理中", "已处理", "已驳回"] as const;
export const ticketTypeEntries = Object.entries(ticketTypes) as [TicketType, typeof ticketTypes[TicketType]][];

export function isTicketType(value: unknown): value is TicketType {
  return typeof value === "string" && Object.hasOwn(ticketTypes, value);
}

export function ticketTypeLabel(value: unknown): string {
  return isTicketType(value) ? ticketTypes[value].label : "未知工单类型";
}
