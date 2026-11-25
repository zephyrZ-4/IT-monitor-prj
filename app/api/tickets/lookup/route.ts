import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { lookupTicket } from "@/lib/tickets";
import { defaultTicketType, isTicketType } from "@/lib/ticket-types";

export async function POST(request: NextRequest) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.trackingCode !== "string" || typeof body.employeeId !== "string" || body.trackingCode.length > 100 || body.employeeId.length > 60) throw new Error("请输入有效的查询编号和工号");
    const type = body.type === undefined ? defaultTicketType : body.type;
    if (!isTicketType(type)) throw new Error("请选择有效的工单类型");
    const ticket = await lookupTicket(body.trackingCode, body.employeeId, type);
    if (!ticket) return NextResponse.json({ error: "未找到对应工单，请核对类型、查询编号和工号" }, { status: 404 });
    return NextResponse.json(ticket);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 400 });
  }
}
