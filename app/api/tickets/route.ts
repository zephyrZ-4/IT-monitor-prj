import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { createTicket, validateTicket } from "@/lib/tickets";

export async function POST(request: NextRequest) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const input = validateTicket(await request.json());
    if (input.website) return NextResponse.json({ error: "提交失败" }, { status: 400 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const result = await createTicket(input, ip);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 400 });
  }
}
