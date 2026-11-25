import type { Metadata } from "next";
import "./globals.css";
import "./analysis.css";
import "./enhancements.css";

export const metadata: Metadata = { title: "IT监控平台", description: "IT 数据监控、分析与工单平台" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
