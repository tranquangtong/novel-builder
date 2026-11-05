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

/** Cookie phiên: chứa ID token của Firebase (hết hạn sau ~1 giờ, trình duyệt tự gia hạn). */
export const SESSION_COOKIE = "nb_session";
export const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/**
 * Xác thực, theo thứ tự:
 *  1. Chạy local (wrangler dev, host localhost) với DEV_AUTH_EMAIL: bỏ qua đăng nhập.
 *  2. Agent: header Authorization: Bearer nbagent_… khớp một token trong AGENT_TOKENS (secret).
 *  3. Firebase (đăng nhập Google): ID token trong cookie nb_session hoặc header Authorization: Bearer.
 *  4. Cloudflare Access (cách cũ, còn dùng được khi Access vẫn bật): header Cf-Access-Jwt-Assertion.
 * Không khớp cách nào → 401. Thiếu cấu hình → 500 (từ chối, không mở cửa).
 */
export async function authenticate(req: Request, env: Env, jwksOverride?: JWTVerifyGetKey): Promise<Identity> {
  const host = new URL(req.url).hostname;
  if (env.DEV_AUTH_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    // chỉ dùng cho test local: giả làm người đọc khác bằng header
    const as = req.headers.get("x-dev-auth-email")?.trim().toLowerCase() || env.DEV_AUTH_EMAIL;
    return { name: as, role: roleForEmail(env, as) };
  }
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (bearer?.startsWith("nbagent_")) return agentFromToken(env, bearer);

  const fbToken = bearer ?? readCookie(req, SESSION_COOKIE);
  if (fbToken && env.FIREBASE_PROJECT_ID) return verifyFirebase(env, fbToken, jwksOverride);

  const accessJwt = req.headers.get("cf-access-jwt-assertion");
  if (accessJwt && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) return verifyAccess(env, accessJwt, jwksOverride);

  if (!env.FIREBASE_PROJECT_ID && !(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD)) {
    throw new AuthError("Máy chủ chưa cấu hình đăng nhập (FIREBASE_PROJECT_ID, hoặc ACCESS_TEAM_DOMAIN + ACCESS_AUD)", 500);
  }
  throw new AuthError(env.FIREBASE_PROJECT_ID ? "Chưa đăng nhập" : "Chưa đăng nhập qua Cloudflare Access", 401);
}

/**
 * Kiểm tra ID token của Firebase đúng như Firebase Admin SDK (token-verifier.ts):
 * RS256 + kid, aud = project ID, iss = https://securetoken.google.com/<project>, sub 1–128 ký tự,
 * còn hạn. Thêm: chỉ nhận đăng nhập bằng Google và email đã xác minh.
 */
export async function verifyFirebase(env: Env, token: string, jwksOverride?: JWTVerifyGetKey): Promise<Identity> {
  const project = env.FIREBASE_PROJECT_ID!.trim();
  let jwks = jwksOverride ?? jwksCache.get(FIREBASE_JWKS_URL);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
    jwksCache.set(FIREBASE_JWKS_URL, jwks);
  }
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: `https://securetoken.google.com/${project}`, audience: project, algorithms: ["RS256"] }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new AuthError(code === "ERR_JWT_EXPIRED" ? "Phiên đăng nhập đã hết hạn" : "Phiên đăng nhập không hợp lệ", 401);
  }
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub || sub.length > 128) throw new AuthError("Phiên đăng nhập không hợp lệ (sub)", 401);
  if (typeof payload.auth_time === "number" && payload.auth_time * 1000 > Date.now() + 60_000) throw new AuthError("Phiên đăng nhập không hợp lệ (auth_time)", 401);
  const provider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  if (provider !== "google.com") throw new AuthError("Chỉ hỗ trợ đăng nhập bằng tài khoản Google", 403);
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!email || payload.email_verified !== true) throw new AuthError("Tài khoản Google chưa xác minh email", 403);
  return { name: email, role: roleForEmail(env, email) };
}

async function verifyAccess(env: Env, token: string, jwksOverride?: JWTVerifyGetKey): Promise<Identity> {
  const team = teamOrigin(env.ACCESS_TEAM_DOMAIN!);
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

/** AGENT_TOKENS (secret): "tên:nbagent_xxx,tên2:nbagent_yyy". So sánh thời gian hằng. */
function agentFromToken(env: Env, token: string): Identity {
  for (const entry of (env.AGENT_TOKENS ?? "").split(",")) {
    const i = entry.indexOf(":");
    const name = entry.slice(0, i).trim();
    const t = entry.slice(i + 1).trim();
    if (i > 0 && t.length >= 32 && safeEqual(t, token)) return { name: `agent:${name.slice(0, 20)}`, role: "agent" };
  }
  throw new AuthError("Token agent không hợp lệ", 401);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
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
