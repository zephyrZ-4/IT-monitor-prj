import { NextResponse } from "next/server";
import { deleteSession, expiredSessionCookie, sameOrigin } from "@/lib/auth";

export async function POST() {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  await deleteSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(expiredSessionCookie());
  return response;
}
