"use client";

import { useState } from "react";
import { exportColumnLabel, exportDefinition, type ExportSheet, type ExportUnit, type ExportView } from "@/lib/export-schema";

type Account = { account: string; name: string };

export function ExportPanel({ view, query, accounts, defaultUnit = "GB", title = "导出 Excel" }: {
  view: ExportView; query: Record<string, string>; accounts?: Account[]; defaultUnit?: ExportUnit; title?: string;
}) {
  const definition = exportDefinition(view, query.type);
  const [unit, setUnit] = useState<ExportUnit>(defaultUnit);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState<Record<string, string[]>>(() => Object.fromEntries(definition.sheets.map(sheet => [sheet.key, sheet.optional ? [] : sheet.columns.map(column => column.key)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = definition.sheets.filter(sheet => scope === "all" || sheet.byAccount);
  const chosen = Object.fromEntries(eligible.filter(sheet => columns[sheet.key]?.length).map(sheet => [sheet.key, columns[sheet.key]]));
  const hasCapacity = eligible.some(sheet => sheet.columns.some(column => column.format === "capacity"));
  const term = search.trim().toLowerCase();
  const matching = accounts?.filter(account => !term || (account.account + " " + account.name).toLowerCase().includes(term)) ?? [];
  const shown = matching.slice(0, 100);

  function toggleAccount(account: string, enabled: boolean) {
    setChecked(old => { const next = new Set(old); if (enabled) next.add(account); else next.delete(account); return next; });
  }
  function toggleSheet(sheet: ExportSheet, enabled: boolean) {
    setColumns(old => ({ ...old, [sheet.key]: enabled ? sheet.columns.map(column => column.key) : [] }));
  }
  function chooseScope(value: "all" | "selected") {
    setScope(value);
    if (value === "selected" && !definition.sheets.some(sheet => sheet.byAccount && columns[sheet.key]?.length)) {
      const first = definition.sheets.find(sheet => sheet.byAccount);
      if (first) toggleSheet(first, true);
    }
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, query, unit, columns: chosen, accounts: scope === "selected" ? [...checked] : undefined }) });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "导出失败，请稍后重试");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      const filename = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.href = url;
      link.download = filename ? decodeURIComponent(filename) : definition.title + ".xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导出失败"); }
    finally { setBusy(false); }
  }

  return <details className="card export-panel">
    <summary className="card-head"><span><strong>{title}</strong><small>按筛选结果选择账号、工作表和列</small></span><span aria-hidden="true" className="export-chevron">▾</span></summary>
    <div className="card-body">
      <div className="toolbar export-toolbar">
        <label className="field"><span>导出范围</span><select className="select" value={scope} onChange={event => chooseScope(event.target.value === "selected" ? "selected" : "all")}>
          <option value="all">当前筛选的全部结果（不限页）</option>{!!accounts?.length && <option value="selected">仅勾选的账号</option>}
        </select></label>
        {hasCapacity && <label className="field"><span>容量单位</span><select className="select" value={unit} onChange={event => setUnit(event.target.value === "TB" ? "TB" : "GB")}><option>GB</option><option>TB</option></select></label>}
      </div>
      {scope === "selected" && <section className="export-section" aria-label="勾选账号">
        <div className="toolbar"><input className="input" placeholder="搜索可勾选的账号或姓名" aria-label="搜索可勾选的账号" value={search} onChange={event => setSearch(event.target.value)}/>
          <button type="button" className="btn" disabled={!matching.length} onClick={() => setChecked(old => new Set([...old, ...matching.map(item => item.account)]))}>勾选全部搜索结果</button>
          <button type="button" className="btn" disabled={!checked.size} onClick={() => setChecked(new Set())}>清空勾选</button>
          <span className="muted">已勾选 {checked.size} 个账号；仅导出账号明细</span>
        </div>
        <div className="export-account-list">{shown.map(item => <label key={item.account}><input type="checkbox" checked={checked.has(item.account)} onChange={event => toggleAccount(item.account, event.target.checked)}/><span>{item.account}{item.name && " · " + item.name}</span></label>)}</div>
        {!shown.length && <p className="muted">未找到匹配的账号。</p>}
        {matching.length > shown.length && <p className="muted">显示前 {shown.length} 个，共 {matching.length} 个；可继续搜索。</p>}
      </section>}
      <div className="export-sheets">{eligible.map(sheet => {
        const picked = columns[sheet.key] ?? [];
        return <fieldset key={sheet.key} className="export-section"><legend><label><input type="checkbox" checked={picked.length > 0} onChange={event => toggleSheet(sheet, event.target.checked)}/>{sheet.label}</label></legend>
          {picked.length > 0 && <div className="export-column-list">{sheet.columns.map(column => <label key={column.key}>
            <input type="checkbox" checked={picked.includes(column.key)} onChange={event => {
              const enabled = event.target.checked;
              setColumns(old => ({ ...old, [sheet.key]: enabled ? [...old[sheet.key], column.key] : old[sheet.key].filter(key => key !== column.key) }));
            }}/>
            {exportColumnLabel(column, unit)}
          </label>)}</div>}
        </fieldset>;
      })}</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="toolbar"><button type="button" className="btn primary" disabled={busy || !Object.keys(chosen).length || (scope === "selected" && !checked.size)} onClick={download}>{busy ? "正在生成…" : "下载 Excel"}</button><span className="muted">文件内附筛选范围和统计口径。</span></div>
    </div>
  </details>;
}
