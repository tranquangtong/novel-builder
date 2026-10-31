import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/server/config";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session";

const OAUTH_COOKIE = "nb_oauth";

function fail(req: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/github", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  if (cfg.mode !== "github" || !cfg.github) return fail(req, "not_configured");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    /* ignore */
  }
  if (!code || !state || !saved.state || state !== saved.state || !saved.verifier) return fail(req, "state");

  const origin = cfg.appUrl ?? req.nextUrl.origin;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.github.clientId, client_secret: cfg.github.clientSecret, code, redirect_uri: `${origin}/api/auth/github/callback`, code_verifier: saved.verifier }),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!tok.access_token) return fail(req, "token");

  const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "the-last-miracle-studio" } });
  if (!userRes.ok) return fail(req, "user");
  const user = (await userRes.json()) as { login: string; id: number; name?: string | null };

  // Bản đầu tiên: chỉ MỘT chủ sở hữu được phép.
  if (user.login.toLowerCase() !== cfg.github.allowedLogin) return fail(req, "forbidden");
  if (cfg.github.allowedUserId && String(user.id) !== cfg.github.allowedUserId) return fail(req, "forbidden");

  const session = await createSessionToken({ login: user.login, userId: String(user.id), name: user.name ?? user.login, mode: "github" });
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/github", maxAge: 0 });
  return res;
}
