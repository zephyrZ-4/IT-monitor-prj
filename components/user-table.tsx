"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserView } from "@/lib/data";
import { formatBytes, utilization, type DisplayUnit } from "@/lib/format";
import { UsageBar } from "@/components/usage-bar";

export function UserTable({ users }: { users: UserView[] }) {
  const [unit, setUnit] = useState<DisplayUnit>("GB");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(users.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageNumbers = Array.from({ length: pages }, (_, index) => index + 1).filter((number) => number === 1 || number === pages || Math.abs(number - currentPage) <= 1);
  return <>
    <div className="card-head"><h2>用户数据</h2><div className="toolbar"><span className="muted">共 {users.length} 条 · 第 {currentPage}/{pages} 页</span><select className="select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="每页条数"><option value={20}>每页 20 条</option><option value={50}>每页 50 条</option><option value={100}>每页 100 条</option></select><select className="select" value={unit} onChange={(event) => setUnit(event.target.value as DisplayUnit)} aria-label="容量单位"><option value="GB">显示 GB</option><option value="TB">显示 TB</option></select></div></div>
    <div className="table-wrap"><table><thead><tr><th>用户账号</th><th>用户名称</th><th>所属部门</th><th>状态</th><th>实际使用人</th><th>Data 已用 / 限额</th><th>Data 使用率</th><th>Home 已用 / 限额</th><th>Home 使用率</th><th>操作</th></tr></thead><tbody>
      {visible.map((user) => <tr key={user.account}>
        <td><Link className="link" href={`/users/${encodeURIComponent(user.account)}`}>{user.account}</Link></td>
        <td>{user.name || "—"}</td><td>{user.department || "—"}</td>
        <td><span className={`tag ${user.status === "正常" ? "" : "warning"}`}>{user.status || "—"}</span></td>
        <td>{user.actual_user || "—"}</td>
        <td className="mono">{formatBytes(user.data_used, unit)} / {formatBytes(user.data_limit, unit)}</td>
        <td><UsageBar percent={utilization(user.data_used, user.data_limit)}/></td>
        <td className="mono">{formatBytes(user.home_used, unit)} / {formatBytes(user.home_limit, unit)}</td>
        <td><UsageBar percent={utilization(user.home_used, user.home_limit)}/></td>
        <td><Link className="link" href={`/users/${encodeURIComponent(user.account)}`}>查看详情</Link></td>
      </tr>)}
    </tbody></table>{users.length === 0 && <div className="empty">没有符合条件的账号</div>}</div>
    {users.length > 0 && <nav className="table-pagination" aria-label="用户数据分页"><span className="muted">显示第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, users.length)} 条，共 {users.length} 条</span><div className="toolbar"><button className="btn" type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>上一页</button>{pageNumbers.map((number, index) => <span key={number} className="page-entry">{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="page-ellipsis">…</span>}<button className={`btn ${number === currentPage ? "primary" : ""}`} type="button" onClick={() => setPage(number)} aria-label={`第 ${number} 页`} aria-current={number === currentPage ? "page" : undefined}>{number}</button></span>)}<button className="btn" type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pages}>下一页</button></div></nav>}
  </>;
}
