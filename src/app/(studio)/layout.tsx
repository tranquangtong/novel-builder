import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { getConfig } from "@/lib/server/config";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/** Mọi trang trong xưởng viết yêu cầu phiên đăng nhập hợp lệ. Nội dung chỉ được tải qua API có kiểm tra. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const cfg = getConfig();
  return (
    <Shell login={session.login} name={session.name ?? session.login} mode={cfg.mode} repoLabel={cfg.github ? `${cfg.github.owner}/${cfg.github.repo}` : "kho demo"}>
      {children}
    </Shell>
  );
}
