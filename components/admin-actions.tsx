"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  return <button className="btn" onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); router.push("/admin/login"); router.refresh(); }}>退出登录</button>;
}

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; duplicate: boolean; warnings: string[]; userCount: number } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/import", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "导入失败");
      setResult(body); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><div className="field-grid"><div className="field"><label>软件用户 XLSX *</label><input className="input" style={{ width: "100%" }} type="file" name="software" accept=".xlsx" required/></div><div className="field"><label>存储用量 CSV *</label><input className="input" style={{ width: "100%" }} type="file" name="usage" accept=".csv" required/></div><div className="field"><label>存储规则 CSV *</label><input className="input" style={{ width: "100%" }} type="file" name="rules" accept=".csv" required/></div></div><p className="muted">三份文件会作为一次快照统一校验和入库。重复上传同一组文件不会新增快照。</p>{error && <div className="notice error">{error}</div>}{result && <div className={`notice ${result.warnings.length ? "warning" : ""}`}>{result.duplicate ? "这组文件已导入，未创建新快照。" : `导入成功：${result.userCount} 个用户，${result.warnings.length} 条提示。`}{result.warnings.length > 0 && <details style={{ marginTop: 8 }}><summary>查看导入提示</summary><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}</div>}<div className="form-actions"><button className="btn primary" disabled={busy}>{busy ? "正在校验并导入…" : "开始导入"}</button></div></form>;
}

export function TicketDecision({ id, initialStatus, initialNote }: { id: string; initialStatus: string; initialNote: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      setMessage("处理状态已保存。业务数据会在下一次导入后更新。"); router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><div className="field-grid"><div className="field"><label>处理状态</label><select className="select" value={status} onChange={(event) => setStatus(event.target.value)}><option>待处理</option><option>处理中</option><option>已处理</option><option>已驳回</option></select></div></div><div className="field" style={{ marginTop: 17 }}><label>管理员备注</label><textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000}/></div>{message && <div className="notice" style={{ marginTop: 15 }}>{message}</div>}<div className="form-actions"><button className="btn primary" disabled={busy}>{busy ? "保存中…" : "保存处理结果"}</button></div></form>;
}
