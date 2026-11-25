import { formatBytes, formatDate } from "@/lib/format";

export function TrendChart({ points, color = "data" }: { points: { date: Date; bytes: string | null }[]; color?: "data" | "home" }) {
  const valid = points.map((point, index) => ({ ...point, index })).filter((point) => point.bytes !== null);
  if (valid.length === 0) return <div className="empty">暂无用量趋势数据</div>;
  const max = Math.max(...valid.map((point) => Number(point.bytes)), 1) * 1.15;
  const x = (index: number) => 35 + index * 630 / Math.max(points.length - 1, 1);
  const y = (value: number) => 195 - value / max * 160;
  const path = valid.map((point, index) => `${index === 0 || point.index !== valid[index - 1].index + 1 ? "M" : "L"}${x(point.index)},${y(Number(point.bytes))}`).join(" ");
  return <div><svg className="chart" viewBox="0 0 700 240" role="img" aria-label="历史用量趋势图">
    {[0, 1, 2, 3].map((index) => <g key={index}><line className="chart-grid" x1="35" x2="665" y1={35 + index * 53.3} y2={35 + index * 53.3}/><text className="chart-label" x="0" y={39 + index * 53.3}>{Math.round((max * (3 - index) / 3) / 1024 ** 3)}</text></g>)}
    <path d={path} className={color === "data" ? "chart-data" : "chart-home"}/>
    {valid.map((point) => <circle key={point.index} cx={x(point.index)} cy={y(Number(point.bytes))} r="4" fill={color === "data" ? "#409eff" : "#67c23a"}><title>{formatDate(point.date)}：{formatBytes(point.bytes)}</title></circle>)}
    <text className="chart-label" x="35" y="226">{formatDate(points[0].date)}</text><text className="chart-label" x="665" y="226" textAnchor="end">{formatDate(points[points.length - 1].date)}</text>
  </svg></div>;
}
