"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import { isTicketType, ticketTypeEntries, ticketTypeLabel, ticketTypes, type TicketType } from "@/lib/ticket-types";

export function TicketLookup({ initialType }: { initialType: TicketType }) {
  const [type, setType] = useState<TicketType>(initialType);
  const [trackingCode, setTrackingCode] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [result, setResult] = useState<{ ticket_type: TicketType; status: string; created_at: string; updated_at: string; admin_note: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/tickets/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, trackingCode, employeeId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "查询失败");
      setResult(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "查询失败"); }
    finally { setBusy(false); }
  }
  return <>
    <div className="card">
      <div className="card-head"><h2>查询工单</h2></div>
      <div className="card-body"><form onSubmit={search} className="toolbar ticket-query">
        <label className="field"><span>工单类型</span><select className="select" name="type" value={type} disabled={busy} onChange={event => {
          if (isTicketType(event.target.value)) { setType(event.target.value); setResult(null); setError(""); }
        }}>{ticketTypeEntries.map(([key, entry]) => <option key={key} value={key}>{entry.label}</option>)}</select></label>
        <label className="field"><span>查询编号</span><input className="input" value={trackingCode} onChange={event => setTrackingCode(event.target.value)} placeholder="提交后获得的编号" maxLength={100} required/></label>
        <label className="field"><span>申请人工号</span><input className="input" value={employeeId} onChange={event => setEmployeeId(event.target.value)} placeholder="请输入工号" maxLength={60} required/></label>
        <button className="btn primary" disabled={busy}>{busy ? "查询中…" : "查询"}</button>
      </form>{type === "polarion-user" && <p className="muted">多人申请请使用第一位申请人的工号查询。</p>}</div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {result && <div className="card">
      <div className="card-head"><h2>处理结果 · {ticketTypeLabel(result.ticket_type)}</h2><span className="tag">{result.status}</span></div>
      <div className="card-body"><dl className="detail-list">
        <div><dt>提交时间</dt><dd>{formatDate(result.created_at)}</dd></div>
        <div><dt>最近处理时间</dt><dd>{formatDate(result.updated_at)}</dd></div>
        <div><dt>管理员备注</dt><dd>{result.admin_note || "暂无"}</dd></div>
      </dl><p className="muted">{ticketTypes[result.ticket_type]?.hasItems ? "集群数据以管理员下一次导入的源系统文件为准。" : "Polarion 账号由管理员处理，请留意工单状态和备注。"}</p></div>
    </div>}
  </>;
}
