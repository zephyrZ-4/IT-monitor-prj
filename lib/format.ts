export type DisplayUnit = "GB" | "TB";

export function formatBytes(bytes: string | number | null | undefined, unit: DisplayUnit = "GB"): string {
  if (bytes === null || bytes === undefined || bytes === "") return "未采集到";
  const number = Number(bytes);
  if (!Number.isFinite(number)) return "未采集到";
  const divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 4;
  return `${(number / divisor).toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${unit}`;
}

export function utilization(used: string | null, limit: string | null): number | null {
  if (used === null || limit === null || Number(limit) <= 0) return null;
  return Number(used) / Number(limit) * 100;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
