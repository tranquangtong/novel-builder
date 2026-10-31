import "server-only";

export type DataMode = "demo" | "github";

export interface AppConfig {
  mode: DataMode;
  sessionSecret: string;
  appUrl?: string;
  demo: { passcode: string; dataDir: string };
  github?: {
    appId: string;
    clientId: string;
    clientSecret: string;
    privateKey: string;
    installationId: string;
    owner: string;
    repo: string;
    branch: string;
    allowedLogin: string;
    allowedUserId?: string;
  };
  missing: string[];
}

const DEV_SECRET = "dev-only-insecure-session-secret-change-me-0000";

function decodeKey(raw: string | undefined): string {
  if (!raw) return "";
  // Hỗ trợ khóa nhiều dòng được ghi bằng \n trong .env, hoặc base64.
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    const t = Buffer.from(raw, "base64").toString("utf8");
    if (t.includes("BEGIN")) return t;
  } catch {
    /* không phải base64 */
  }
  return raw;
}

export function getConfig(): AppConfig {
  const env = process.env;
  const mode: DataMode = env.DATA_MODE === "github" ? "github" : "demo";
  const missing: string[] = [];
  let sessionSecret = env.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    if (env.NODE_ENV === "production" && mode === "github") missing.push("SESSION_SECRET (>= 32 ký tự)");
    sessionSecret = sessionSecret || DEV_SECRET;
  }
  const cfg: AppConfig = {
    mode,
    sessionSecret,
    appUrl: env.APP_URL,
    // Ở production, chế độ demo bắt buộc đặt DEMO_PASSCODE (không dùng mặc định "demo").
    demo: { passcode: env.DEMO_PASSCODE || (env.NODE_ENV === "production" ? "" : "demo"), dataDir: env.DEMO_DATA_DIR || ".demo-data" },
    missing,
  };
  if (mode === "demo" && !cfg.demo.passcode) missing.push("DEMO_PASSCODE");
  if (mode === "github") {
    const need = ["GITHUB_APP_ID", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID", "GITHUB_REPO_OWNER", "GITHUB_REPO_NAME", "ALLOWED_GITHUB_LOGIN"];
    for (const k of need) if (!env[k]) missing.push(k);
    cfg.github = {
      appId: env.GITHUB_APP_ID ?? "",
      clientId: env.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_APP_CLIENT_SECRET ?? "",
      privateKey: decodeKey(env.GITHUB_APP_PRIVATE_KEY),
      installationId: env.GITHUB_APP_INSTALLATION_ID ?? "",
      owner: env.GITHUB_REPO_OWNER ?? "",
      repo: env.GITHUB_REPO_NAME ?? "",
      branch: env.GITHUB_REPO_BRANCH || "main",
      allowedLogin: (env.ALLOWED_GITHUB_LOGIN ?? "").toLowerCase(),
      allowedUserId: env.ALLOWED_GITHUB_USER_ID || undefined,
    };
  }
  return cfg;
}

/** Thông tin cấu hình an toàn để hiển thị (không có giá trị bí mật). */
export function publicConfigStatus() {
  const c = getConfig();
  const set = (k: string) => Boolean(process.env[k]);
  return {
    mode: c.mode,
    repo: c.github ? `${c.github.owner}/${c.github.repo}` : "demo",
    branch: c.github?.branch ?? "main",
    allowedLogin: c.github?.allowedLogin ?? null,
    missing: c.missing,
    env: Object.fromEntries(
      ["DATA_MODE", "SESSION_SECRET", "APP_URL", "GITHUB_APP_ID", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_INSTALLATION_ID", "GITHUB_REPO_OWNER", "GITHUB_REPO_NAME", "GITHUB_REPO_BRANCH", "ALLOWED_GITHUB_LOGIN", "ALLOWED_GITHUB_USER_ID"].map((k) => [k, set(k)]),
    ),
  };
}
