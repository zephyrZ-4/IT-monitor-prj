"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { UserView } from "@/lib/data";
import { formatBytes } from "@/lib/format";
import type { ApplicantInput, TicketField } from "@/lib/tickets";
import { MAX_POLARION_APPLICANTS, ticketTypes, type TicketType } from "@/lib/ticket-types";

type Item = { account: string; field: TicketField; volume: "home" | "data" | ""; requestedValue: string; reason: string };
const newItem = (account = ""): Item => ({ account, field: "所属部门", volume: "", requestedValue: "", reason: "" });

function currentValue(user: UserView | undefined, item: Item): string {
  if (!user) return "请先选择用户账号";
  if (item.field === "限额") {
    if (!item.volume) return "请先选择 home 或 data 目录";
    return formatBytes(item.volume === "home" ? user.home_limit : user.data_limit, "GB");
  }
  const value = item.field === "所属部门" ? user.department : item.field === "状态" ? user.status : user.actual_user;
  return value || "未填写";
}

export function TicketForm({ type, accounts = [], initialAccount = "" }: { type: TicketType; accounts?: UserView[]; initialAccount?: string }) {
  const hasItems = ticketTypes[type].hasItems;
  const isPolarion = type === "polarion-user";
  const [applicantName, setApplicantName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [additional, setAdditional] = useState<(ApplicantInput & { id: number })[]>([]);
  const nextApplicantId = useRef(1);
  const [items, setItems] = useState<Item[]>(() => hasItems ? [newItem(accounts.some((user) => user.account === initialAccount) ? initialAccount : "")] : []);
  const accountByName = new Map(accounts.map((user) => [user.account, user]));
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  function update(index: number, patch: Partial<Item>) {
    setItems((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  function updateApplicant(id: number, patch: Partial<ApplicantInput>) {
    setAdditional(current => current.map(person => person.id === id ? { ...person, ...patch } : person));
  }

  function addApplicant() {
    const id = nextApplicantId.current++;
    setAdditional(current => current.length + 1 >= MAX_POLARION_APPLICANTS ? current : [...current, { id, applicantName: "", employeeId: "" }]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        type, applicantName, employeeId, website,
        items: hasItems ? items.map(item => ({ ...item, volume: item.field === "限额" ? item.volume : null })) : undefined,
        additionalApplicants: isPolarion ? additional.map(({ applicantName, employeeId }) => ({ applicantName, employeeId })) : undefined,
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "提交失败");
      setTrackingCode(body.trackingCode);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setBusy(false); }
  }

  if (trackingCode) return <div className="card"><div className="card-body"><h2>工单提交成功</h2><p>已提交「{ticketTypes[type].label}」{isPolarion ? "，共 " + (additional.length + 1) + " 人" : ""}。请保存查询编号，之后可配合{isPolarion ? "第一位申请人的工号" : "工号"}查看处理状态。</p><div className="notice"><strong style={{ fontSize: 20, letterSpacing: 2 }}>{trackingCode}</strong></div><Link className="btn primary" href={"/tickets/lookup?type=" + type}>查询工单</Link></div></div>;
  return <form onSubmit={submit}>
    <div className="card">
      <div className="card-head"><h2>{isPolarion ? "申请人名单" : "申请人信息"}</h2><span className="muted">{isPolarion ? "每单最多 " + MAX_POLARION_APPLICANTS + " 人 · 无需登录" : "无需登录"}</span></div>
      <div className="card-body">
        <fieldset disabled={busy} className="ticket-applicants">
          {isPolarion && <div className="notice">多人共用一个查询编号，查询时请使用第一位申请人的工号。</div>}
          <div className="field-grid">
            <label className="field"><span>{isPolarion ? "第 1 位申请人姓名" : "申请人姓名"} *</span><input className="input" value={applicantName} onChange={event => setApplicantName(event.target.value)} maxLength={60} required/></label>
            <label className="field"><span>{isPolarion ? "第 1 位工号（用于查询）" : "工号"} *</span><input className="input" value={employeeId} onChange={event => setEmployeeId(event.target.value)} maxLength={60} required/></label>
          </div>
          {isPolarion && <>
            {additional.map(({ id, applicantName: name, employeeId: employee }, index) => <div className="ticket-item ticket-applicant" key={id}>
              <div className="ticket-item-head"><span>第 {index + 2} 位申请人</span><button className="btn danger" type="button" onClick={() => setAdditional(current => current.filter(person => person.id !== id))}>删除</button></div>
              <div className="field-grid">
                <label className="field"><span>姓名 *</span><input className="input" value={name} onChange={event => updateApplicant(id, { applicantName: event.target.value })} maxLength={60} required/></label>
                <label className="field"><span>工号 *</span><input className="input" value={employee} onChange={event => updateApplicant(id, { employeeId: event.target.value })} maxLength={60} required/></label>
              </div>
            </div>)}
            <button className="btn ticket-add-applicant" type="button" onClick={addApplicant} disabled={additional.length + 1 >= MAX_POLARION_APPLICANTS}>＋ 添加申请人</button>
          </>}
        </fieldset>
        <input style={{ display: "none" }} tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} aria-hidden="true"/>
      </div>
    </div>
    {hasItems && <div className="card"><div className="card-head"><h2>修改事项</h2><span className="muted">每单最多 10 项</span></div><div className="card-body"><div className="notice">提交工单后，管理员会在软件系统或存储系统手动处理。网站数据会在下一次导入后更新。</div>
      {items.map((item, index) => <div className="ticket-item" key={index}><div className="ticket-item-head"><span>事项 {index + 1}</span>{items.length > 1 && <button className="btn danger" type="button" onClick={() => setItems(items.filter((_, position) => position !== index))}>删除</button>}</div><div className="field-grid">
        <div className="field"><label>用户账号 *</label><select className="select" value={item.account} onChange={(event) => update(index, { account: event.target.value, requestedValue: "" })} required><option value="">请选择账号</option>{accounts.map((user) => <option key={user.account} value={user.account}>{user.account}</option>)}</select></div>
        <div className="field"><label>修改字段 *</label><select className="select" value={item.field} onChange={(event) => update(index, { field: event.target.value as TicketField, volume: "", requestedValue: "" })}><option>所属部门</option><option>状态</option><option>实际使用人</option><option>限额</option></select></div>
        {item.field === "限额" && <div className="field"><label>目录 *</label><select className="select" value={item.volume} onChange={(event) => update(index, { volume: event.target.value as "home" | "data" })} required><option value="">请选择目录</option><option value="home">home</option><option value="data">data</option></select></div>}
        <div className="field"><label>当前值（最新导入）</label><output className="input current-value" aria-live="polite">{currentValue(accountByName.get(item.account), item)}</output></div>
        <div className="field"><label>期望修改为 *</label><input className="input" value={item.requestedValue} onChange={(event) => update(index, { requestedValue: event.target.value })} placeholder={item.field === "限额" ? "例如 2 TB 或 500 GB" : "请输入期望值"} maxLength={200} required/></div>
      </div><div className="field" style={{ marginTop: 15 }}><label>申请原因 *</label><textarea className="textarea" value={item.reason} onChange={(event) => update(index, { reason: event.target.value })} maxLength={1000} required/></div></div>)}
      <button className="btn" type="button" disabled={items.length >= 10} onClick={() => setItems([...items, newItem()])}>＋ 添加事项</button>
    </div></div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="form-actions"><Link className="btn" href="/">取消</Link><button className="btn primary" type="submit" disabled={busy}>{busy ? "提交中…" : hasItems ? "提交工单" : "申请"}</button></div>
  </form>;
}
