import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { getConfig } from "@/lib/server/config";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session";

function eq(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest(), hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Đăng nhập chế độ DEMO bằng mã truy cập. Không tồn tại ở chế độ GitHub. */
export async function POST(req: NextRequest) {
  const cfg = getConfig();
  if (cfg.mode !== "demo") return NextResponse.json({ error: "Chế độ demo đang tắt" }, { status: 404 });
  let passcode = "";
  try {
    passcode = String(((await req.json()) as { passcode?: string }).passcode ?? "");
  } catch {
    /* ignore */
  }
  if (!cfg.demo.passcode) return NextResponse.json({ error: "Chưa đặt DEMO_PASSCODE trên máy chủ" }, { status: 503 });
  if (!eq(passcode, cfg.demo.passcode)) return NextResponse.json({ error: "Mã truy cập không đúng" }, { status: 401 });
  const token = await createSessionToken({ login: "tac-gia-demo", name: "Tác giả (demo)", mode: "demo" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
