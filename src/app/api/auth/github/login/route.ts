import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "@/lib/server/config";

const OAUTH_COOKIE = "nb_oauth";

function b64url(b: Buffer) {
  return b.toString("base64url");
}

/**
 * Bắt đầu web flow của GitHub App (user access token) với state + PKCE (S256).
 * Token người dùng chỉ dùng để xác minh danh tính, không được lưu lại.
 */
export async function GET(req: NextRequest) {
  const cfg = getConfig();
  if (cfg.mode !== "github" || !cfg.github?.clientId) return NextResponse.redirect(new URL("/login?error=not_configured", req.url));
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const origin = cfg.appUrl ?? req.nextUrl.origin;
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", cfg.github.clientId);
  u.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("allow_signup", "false");
  const res = NextResponse.redirect(u);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/github", maxAge: 600 });
  return res;
}
