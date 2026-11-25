import { formatPercent } from "@/lib/format";

export function UsageBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="muted">未采集到</span>;
  const tone = percent >= 100 ? "danger" : percent >= 80 ? "warning" : "normal";
  return <div className="usage-bar"><div className="usage-track"><span className={`usage-fill ${tone}`} style={{ width: `${Math.min(percent, 100)}%` }}/></div><span className={`usage-number ${tone}`}>{formatPercent(percent)}</span></div>;
}
