import { NextResponse } from "next/server";
import { getAdmin, sameOrigin } from "@/lib/auth";
import { buildExport, ExportError, parseExportRequest } from "@/lib/export-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const input = parseExportRequest(await request.json());
    if (input.view === "tickets" && !(await getAdmin())) return NextResponse.json({ error: "请先登录管理员账号" }, { status: 401 });
    const { name, bytes } = await buildExport(input);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=report.xlsx; filename*=UTF-8''" + encodeURIComponent(name),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof ExportError ? error.message : "无效的导出请求" }, { status: 400 });
    console.error("export failed", error);
    return NextResponse.json({ error: "导出失败，请稍后重试" }, { status: 500 });
  }
}
