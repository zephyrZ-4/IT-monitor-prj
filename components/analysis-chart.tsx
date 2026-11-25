import type { TrendPoint } from "@/lib/analytics";
import { formatBytes, formatDate } from "@/lib/format";

export function AnalysisChart({ points }: { points: TrendPoint[] }) {
  if (!points.length) return <div className="empty">暂无导入数据</div>;
  if (points.length === 1) return <div className="analysis-single-point"><strong>{formatDate(points[0].date)}</strong><span>限额 {formatBytes(points[0].limitBytes, "TB")} · 已采集用量 {formatBytes(points[0].knownUsedBytes, "TB")}</span><p>目前只有 1 批真实数据。后续导入后，这里会显示实际趋势。</p></div>;
  const max = Math.max(1, ...points.flatMap((point) => [point.limitBytes, point.knownUsedBytes])) * 1.08;
  const left = 48; const right = 750; const top = 20; const bottom = 208;
  const x = (index: number) => left + (right - left) * index / Math.max(1, points.length - 1);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const path = (key: "limitBytes" | "knownUsedBytes") => points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point[key])}`).join(" ");
  return <div className="analysis-chart-wrap"><svg className="analysis-chart" viewBox="0 0 790 250" role="img" aria-label="历史限额和已采集用量趋势">
    {[0, 1, 2, 3, 4].map((step) => <g key={step}><line x1={left} x2={right} y1={bottom - step * 47} y2={bottom - step * 47} className="chart-grid"/><text x="3" y={bottom - step * 47 + 4} className="chart-label">{(max * step / 4 / 1024 ** 4).toFixed(1)}T</text></g>)}
    <path d={path("limitBytes")} className="analysis-chart-limit"/><path d={path("knownUsedBytes")} className="analysis-chart-used"/>
    {points.map((point, index) => <g key={point.id}><circle cx={x(index)} cy={y(point.limitBytes)} r="4" className="analysis-dot-limit"><title>{formatDate(point.date)} 限额 {formatBytes(point.limitBytes, "TB")}</title></circle><circle cx={x(index)} cy={y(point.knownUsedBytes)} r="4" className="analysis-dot-used"><title>{formatDate(point.date)} 已采集用量 {formatBytes(point.knownUsedBytes, "TB")}{point.missingUsage ? `，${point.missingUsage} 个账号用量不完整` : ""}</title></circle></g>)}
    <text x={left} y="239" className="chart-label">{formatDate(points[0].date)}</text><text x={right} y="239" textAnchor="end" className="chart-label">{formatDate(points[points.length - 1].date)}</text>
  </svg><div className="analysis-legend"><span className="legend-limit">分配限额</span><span className="legend-used">已采集用量</span></div></div>;
}
