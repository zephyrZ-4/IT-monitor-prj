import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { ensureSchema, pool } from "@/lib/db";

const COOKIE = "cluster_admin_session";
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export async function createSession(adminId: string): Promise<string> {
  await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  await pool().query("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1,$2,$3)", [hashToken(token), adminId, new Date(Date.now() + DAY_MS)]);
  return token;
}

export async function getAdmin(): Promise<{ id: string; username: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const result = await pool().query(
    "SELECT a.id::text, a.username FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function deleteSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await pool().query("DELETE FROM admin_sessions WHERE token_hash=$1", [hashToken(token)]);
  }
}

export function sessionCookie(token: string) {
  return { name: COOKIE, value: token, httpOnly: true, sameSite: "lax" as const, secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: DAY_MS / 1000 };
}

export function expiredSessionCookie() {
  return { name: COOKIE, value: "", httpOnly: true, sameSite: "lax" as const, secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 0 };
}

export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
