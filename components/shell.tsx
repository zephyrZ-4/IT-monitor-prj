import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarMenu } from "@/components/sidebar-menu";

export function Shell({ title, subtitle, children, admin = false }: { title: string; subtitle?: string; children: ReactNode; admin?: boolean }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">▦</span><span>IT监控平台<small>IT MONITORING</small></span></Link>
      <SidebarMenu admin={admin}/>
      <div className="sidebar-foot"><span className="online-dot"/> 内网数据服务</div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="crumb">首页 <span>/</span> {title}</div><div className="top-right"><span className="avatar">IT</span></div></header>
      <main className="content">
        <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>
        {children}
      </main>
      <footer className="footer">IT监控平台 · 集群数据以成功导入的批次为准</footer>
    </div>
  </div>;
}
