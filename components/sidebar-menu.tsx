"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { analysisSections } from "@/lib/navigation";
import { ticketTypeEntries } from "@/lib/ticket-types";

export function SidebarMenu({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const ticketRoute = pathname.startsWith("/tickets/") || pathname === "/admin/tickets" || pathname.startsWith("/admin/tickets/");
  const currentModule = ticketRoute ? "tickets" : pathname.startsWith("/admin") ? "system" : "cluster";
  const modules = [
    { id: "tickets", label: "工单", links: [
      ...ticketTypeEntries.map(([, { href, label, icon }]) => ({ href, label, icon })),
      { href: "/tickets/lookup", label: "工单查询", icon: "⌕" },
      ...(admin ? [{ href: "/admin/tickets", label: "工单处理", icon: "☑" }] : []),
    ] },
    { id: "cluster", label: "集群数据", links: [
      { href: "/", label: "数据总览", icon: "◫" },
      ...analysisSections,
    ] },
    { id: "system", label: "系统管理", links: [
      { href: admin ? "/admin" : "/admin/login", label: admin ? "数据导入" : "管理员登录", icon: "⇧" },
    ] },
  ];

  return <div className="sidebar-menu">
    {modules.map(({ id, label, links }) => <details key={id} className="sidebar-module" open={currentModule === id}>
      <summary className="sidebar-module-title"><span>{label}</span><span className="sidebar-caret" aria-hidden="true">▸</span></summary>
      <nav className="side-nav" aria-label={label}>
        {links.map(({ href, label: text, icon }) => <Link key={href} href={href} className="side-link" aria-current={pathname === href ? "page" : undefined}>
          <span aria-hidden="true">{icon}</span>{text}
        </Link>)}
      </nav>
    </details>)}
  </div>;
}
