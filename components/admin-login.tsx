"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "登录失败");
      router.push("/admin"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }
  return <div className="card" style={{ maxWidth: 460, margin: "40px auto" }}><div className="card-head"><h2>管理员登录</h2></div><div className="card-body"><form onSubmit={submit} style={{ display: "grid", gap: 17 }}><div className="field"><label>管理员账号</label><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username"/></div><div className="field"><label>密码</label><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password"/></div>{error && <div className="notice error">{error}</div>}<button className="btn primary" disabled={busy}>{busy ? "登录中…" : "登录"}</button></form></div></div>;
}
