"use client";
import type { Auth } from "firebase/auth";
import { IS_CLOUD_BUILD } from "./connection";

/**
 * Đăng nhập Google qua Firebase Authentication (chỉ bản build Cloudflare).
 * Cấu hình web của Firebase không phải bí mật (Firebase thiết kế để nằm trong trang);
 * quyền thật do Worker quyết định sau khi kiểm tra chữ ký ID token.
 */
const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};
export const FIREBASE_ENABLED = IS_CLOUD_BUILD && !!(CONFIG.apiKey && CONFIG.authDomain && CONFIG.projectId);

type AuthMod = typeof import("firebase/auth");
let loading: Promise<{ auth: Auth; m: AuthMod }> | null = null;

/** Tải Firebase khi cần (không làm nặng trang cho bản không dùng Firebase). */
function load() {
  if (!FIREBASE_ENABLED) return Promise.reject(new Error("Chưa cấu hình Firebase"));
  loading ??= (async () => {
    const [{ initializeApp }, m] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    const auth = m.getAuth(initializeApp(CONFIG));
    m.onIdTokenChanged(auth, (u) => {
      // Firebase tự gia hạn ID token (~1 giờ/lần) → cập nhật cookie phiên theo
      if (u) void u.getIdToken().then(postSession).catch(() => {});
    });
    return { auth, m };
  })();
  return loading;
}

async function postSession(idToken: string) {
  const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }), credentials: "same-origin", cache: "no-store" });
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? `Lỗi ${r.status}`);
  }
}

export async function signInWithGoogle() {
  const { auth, m } = await load();
  const provider = new m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await m.signInWithPopup(auth, provider);
  await postSession(await cred.user.getIdToken());
}

/** Cookie phiên hết hạn nhưng Firebase vẫn còn đăng nhập → lấy token mới. Trả false nếu chưa đăng nhập. */
export async function refreshSession(): Promise<boolean> {
  if (!FIREBASE_ENABLED) return false;
  try {
    const { auth } = await load();
    await auth.authStateReady();
    const u = auth.currentUser;
    if (!u) return false;
    await postSession(await u.getIdToken(true));
    return true;
  } catch {
    return false;
  }
}

export async function signOutEverywhere() {
  await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
  if (FIREBASE_ENABLED) {
    const { auth, m } = await load();
    await m.signOut(auth);
  }
  // tải lại hẳn trang để xoá mọi dữ liệu đã tải trong bộ nhớ
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- cố ý tải lại toàn trang
  window.location.assign("/");
}
