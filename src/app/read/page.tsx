"use client";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cloudFetch } from "@/lib/client/api";
import { CloudAuthError, useCloudMe, type CloudMe } from "@/lib/client/hooks";
import { FIREBASE_ENABLED, signOutEverywhere } from "@/lib/client/firebase";
import { IS_CLOUD_BUILD } from "@/lib/client/connection";
import { LoginScreen } from "@/components/LoginScreen";
import { CloudLoginError } from "@/components/CloudLoginError";
import { Markdown } from "@/components/Markdown";
import { ProtectedContent } from "@/components/ProtectedContent";

type Toc = { title: string; subtitle: string | null; acts: { id: string; title: string; chapters: { id: string; number: number; title: string; words: number }[] }[] };
type Chapter = { id: string; number: number; title: string; act: string | null; body: string; words: number; prev: Ref | null; next: Ref | null };
type Ref = { id: string; number: number; title: string };

const href = (n?: string, c?: string) => `/read/${n ? `?n=${encodeURIComponent(n)}${c ? `&c=${encodeURIComponent(c)}` : ""}` : ""}`;

/** CHẾ ĐỘ ĐỌC: mọi tài khoản đã đăng nhập. Người đọc chỉ thấy trang này. */
function Reader() {
  const me = useCloudMe();
  const sp = useSearchParams();
  const n = sp.get("n") ?? undefined;
  const c = sp.get("c") ?? undefined;

  if (!IS_CLOUD_BUILD) return <div className="login-wrap"><div className="card card-pad">Chế độ đọc chỉ có trên bản Cloudflare.</div></div>;
  if (me.isLoading) return <div className="login-wrap"><span className="spinner" /></div>;
  if (me.error) {
    if (FIREBASE_ENABLED && me.error instanceof CloudAuthError && me.error.status === 401) return <LoginScreen onDone={() => void me.refetch()} />;
    return <CloudLoginError message={me.error.message} onRetry={() => void me.refetch()} />;
  }
  if (!me.data) return null;
  return (
    <div className="reader" data-testid="reader">
      <ReaderTop me={me.data} novelId={n} />
      <main className="reader-main">
        {!n ? <NovelList /> : !c ? <TocView novelId={n} /> : <ChapterView novelId={n} chapterId={c} viewer={me.data.name} />}
      </main>
    </div>
  );
}

function ReaderTop({ me, novelId }: { me: CloudMe; novelId?: string }) {
  const toc = useQuery({ queryKey: ["read-toc", novelId], enabled: !!novelId, queryFn: () => cloudFetch<Toc>(`/api/novels/${novelId}/read`) });
  return (
    <header className="reader-top">
      <span className="brand-title">{toc.data?.title ?? "Thư viện truyện"}</span>
      {novelId && <Link className="btn sm ghost" href={href(novelId)} data-testid="reader-toc-link">Mục lục</Link>}
      {me.role === "editor" && <Link className="btn sm" href="/" data-testid="back-to-studio">← Chế độ viết</Link>}
      <span className="small muted" title={me.name}>{me.name}</span>
      {FIREBASE_ENABLED && <button className="btn sm ghost" onClick={() => void signOutEverywhere()}>Đăng xuất</button>}
    </header>
  );
}

function NovelList() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["read-novels"], queryFn: () => cloudFetch<{ novels: { id: string; title: string }[] }>("/api/novels") });
  const only = q.data?.novels.length === 1 ? q.data.novels[0].id : null;
  useEffect(() => {
    if (only) router.replace(href(only));
  }, [only, router]);
  if (q.isLoading || only) return <span className="spinner" />;
  if (q.error) return <div className="banner danger"><div className="small">{(q.error as Error).message}</div></div>;
  return (
    <>
      <h1>Thư viện truyện</h1>
      {!q.data?.novels.length && <p className="muted">Chưa có truyện nào.</p>}
      {q.data?.novels.map((nv) => (
        <Link key={nv.id} className="toc-ch" href={href(nv.id)}>{nv.title}</Link>
      ))}
    </>
  );
}

function TocView({ novelId }: { novelId: string }) {
  const q = useQuery({ queryKey: ["read-toc", novelId], queryFn: () => cloudFetch<Toc>(`/api/novels/${novelId}/read`) });
  if (q.isLoading) return <span className="spinner" />;
  if (q.error) return <div className="banner danger"><div className="small">{(q.error as Error).message}</div></div>;
  const t = q.data!;
  const first = t.acts[0]?.chapters[0];
  return (
    <div data-testid="reader-toc">
      <div className="reader-kicker">Mục lục</div>
      <h1>{t.title}</h1>
      {t.subtitle && <p className="muted">{t.subtitle}</p>}
      {first && <Link className="btn primary" href={href(novelId, first.id)}>Bắt đầu đọc</Link>}
      {!t.acts.length && <p className="muted">Chưa có chương nào.</p>}
      {t.acts.map((a) => (
        <section key={a.id}>
          <div className="toc-act">{a.title}</div>
          {a.chapters.map((ch) => (
            <Link key={ch.id} className="toc-ch" href={href(novelId, ch.id)}>
              <span className="n">{ch.number}</span>
              <span>{ch.title}</span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

function ChapterView({ novelId, chapterId, viewer }: { novelId: string; chapterId: string; viewer: string }) {
  const q = useQuery({ queryKey: ["read-ch", novelId, chapterId], queryFn: () => cloudFetch<Chapter>(`/api/novels/${novelId}/read/${chapterId}`) });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [chapterId]);
  if (q.isLoading) return <span className="spinner" />;
  if (q.error) return <div className="banner danger"><div className="small">{(q.error as Error).message}</div></div>;
  const ch = q.data!;
  return (
    <article data-testid="reader-chapter">
      <div className="reader-kicker">{ch.act ? `${ch.act} · ` : ""}Chương {ch.number}</div>
      <ProtectedContent viewer={viewer}>
        <h1>{ch.title}</h1>
        <Markdown text={ch.body} novelId={novelId} />
      </ProtectedContent>
      <nav className="reader-nav">
        {ch.prev ? <Link className="btn" href={href(novelId, ch.prev.id)} data-testid="reader-prev">← Ch {ch.prev.number} · {ch.prev.title}</Link> : <span />}
        {ch.next ? <Link className="btn primary" href={href(novelId, ch.next.id)} data-testid="reader-next">Ch {ch.next.number} · {ch.next.title} →</Link> : <span className="muted small">Hết chương hiện có</span>}
      </nav>
    </article>
  );
}

export default function ReadPage() {
  return <Suspense fallback={null}><Reader /></Suspense>;
}
