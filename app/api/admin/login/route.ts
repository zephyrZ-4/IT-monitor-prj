import { NextRequest, NextResponse } from "next/server";
import { createSession, sameOrigin, sessionCookie, verifyPassword } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });
    await ensureSchema();
    const result = await pool().query("SELECT id::text,password_hash FROM admins WHERE username=$1", [username]);
    if (!result.rowCount || !verifyPassword(password, result.rows[0].password_hash)) {
      return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
    }
    const token = await createSession(result.rows[0].id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token));
    return response;
  } catch (error) {
    console.error("admin login failed", error);
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
