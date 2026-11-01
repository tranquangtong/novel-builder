import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Role } from "../src/lib/core/api-routes";
import type { Env } from "./env";

export interface Identity {
  /** email người dùng, hoặc "agent:<client-id>" với service token */
  name: string;
  role: Role;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

const jwksCache = new Map<string, JWTVerifyGetKey>();
const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * Xác thực theo Cloudflare Access: kiểm tra chữ ký JWT trong header Cf-Access-Jwt-Assertion
 * bằng khóa công khai của team (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs),
 * issuer và audience (AUD) của ứng dụng. Thiếu cấu hình → từ chối (fail closed).
 */
export async function authenticate(req: Request, env: Env, jwksOverride?: JWTVerifyGetKey): Promise<Identity> {
  const host = new URL(req.url).hostname;
  if (env.DEV_AUTH_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return { name: env.DEV_AUTH_EMAIL, role: roleForEmail(env, env.DEV_AUTH_EMAIL) };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new AuthError("Máy chủ chưa cấu hình Cloudflare Access (ACCESS_TEAM_DOMAIN, ACCESS_AUD)", 500);
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) throw new AuthError("Chưa đăng nhập qua Cloudflare Access", 401);
  const team = teamOrigin(env.ACCESS_TEAM_DOMAIN);
  const auds = list(env.ACCESS_AUD);
  let jwks = jwksOverride ?? jwksCache.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
    jwksCache.set(team, jwks);
  }
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: team, audience: auds }));
  } catch (e) {
    throw new AuthError(explain(token, team, auds, e), 401);
  }
  if (typeof payload.email === "string" && payload.email) {
    return { name: payload.email.toLowerCase(), role: roleForEmail(env, payload.email) };
  }
  const clientId = typeof payload.common_name === "string" ? payload.common_name.toLowerCase() : "";
  if (clientId && list(env.AGENT_CLIENT_IDS).includes(clientId)) {
    return { name: `agent:${clientId.split(".")[0].slice(0, 8)}`, role: "agent" };
  }
  throw new AuthError("Tài khoản này không được phép truy cập", 403);
}

/** "tqtong.cloudflareaccess.com", "https://tqtong.cloudflareaccess.com/" → "https://tqtong.cloudflareaccess.com" */
export function teamOrigin(v: string) {
  const t = v.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(t) ? t.replace(/^http:/i, "https:") : `https://${t}`;
}

/** Lý do cụ thể khi JWT không hợp lệ (issuer/AUD không phải bí mật — chỉ hiện vài ký tự đầu). */
function explain(token: string, team: string, auds: string[], e: unknown): string {
  const short = (x: unknown) => String(x ?? "").slice(0, 10) + "…";
  try {
    const p = decodeJwt(token);
    if (p.iss !== team) return `Phiên Access không hợp lệ: team trong phiên là ${String(p.iss)}, nhưng ACCESS_TEAM_DOMAIN là ${team}`;
    const tokenAud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!tokenAud.some((a) => auds.includes(String(a).toLowerCase()))) return `Phiên Access không hợp lệ: AUD của ứng dụng Access là ${short(tokenAud[0])}, nhưng ACCESS_AUD là ${auds.map(short).join(", ") || "(trống)"}`;
    if (typeof p.exp === "number" && p.exp * 1000 < Date.now()) return "Phiên Cloudflare Access đã hết hạn, hãy tải lại trang";
  } catch {
    /* không đọc được JWT */
  }
  return `Phiên đăng nhập Cloudflare Access không hợp lệ (${e instanceof Error ? e.message : String(e)})`;
}

function roleForEmail(env: Env, email: string): Role {
  return list(env.EDITOR_EMAILS).includes(email.toLowerCase()) ? "editor" : "viewer";
}

/** Chỉ dùng trong test: gắn bộ khóa công khai cho một team thay vì tải từ mạng. */
export function registerJwksForTests(teamDomain: string, jwks: JWTVerifyGetKey) {
  jwksCache.set(teamDomain.replace(/\/$/, ""), jwks);
}
