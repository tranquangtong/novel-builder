import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getConfig, type DataMode } from "./config";

export const SESSION_COOKIE = "nb_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface Session {
  login: string;
  userId?: string;
  name?: string;
  email?: string;
  mode: DataMode;
}

function key(): Uint8Array {
  return new Uint8Array(createHash("sha256").update(getConfig().sessionSecret).digest());
}

export async function createSessionToken(s: Session): Promise<string> {
  return new EncryptJWT({ ...s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .encrypt(key());
}

/**
 * Giải mã và KIỂM TRA LẠI quyền ở mỗi request: phiên chỉ hợp lệ nếu đúng chế độ
 * hiện tại và (ở chế độ GitHub) đúng tài khoản được phép trong cấu hình.
 */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    const s = payload as unknown as Session;
    const cfg = getConfig();
    if (s.mode !== cfg.mode) return null;
    if (cfg.mode === "github") {
      if (!cfg.github || cfg.missing.length) return null;
      if (s.login.toLowerCase() !== cfg.github.allowedLogin) return null;
      if (cfg.github.allowedUserId && s.userId !== cfg.github.allowedUserId) return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIE,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
