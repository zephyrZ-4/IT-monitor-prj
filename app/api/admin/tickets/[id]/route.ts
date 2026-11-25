import { NextRequest, NextResponse } from "next/server";
import { getAdmin, sameOrigin } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { ticketStatuses } from "@/lib/ticket-types";

const STATUSES = new Set<string>(ticketStatuses);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理员账号" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const status = typeof body.status === "string" ? body.status : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!STATUSES.has(status) || note.length > 2000) throw new Error("处理状态或备注无效");
    await ensureSchema();
    const result = await pool().query(
      "UPDATE tickets SET status=$1,admin_note=$2,handled_by=$3,updated_at=now() WHERE id=$4 RETURNING id",
      [status, note, admin.id, id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "处理失败" }, { status: 400 });
  }
}
