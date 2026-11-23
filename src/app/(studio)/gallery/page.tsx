"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, cloudFetch, fmtDate } from "@/lib/client/api";
import { useConnection } from "@/lib/client/connection";
import { useCloudMe, useProject } from "@/lib/client/hooks";
import { chapterHref } from "@/lib/client/links";
import {
  buildChapterOptions,
  countByKind,
  filterAssets,
  formatAssetSize,
  resolveScopeLabel,
  sortAssetsNewestFirst,
} from "@/lib/domain/gallery";
import { KINDS, kindLabel, trashConfirmMessage, trashNovelAsset, type Asset } from "@/components/ChapterImages";
import { assetUrl } from "@/components/Markdown";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export default function GalleryPage() {
  const conn = useConnection();
  const cloudMe = useCloudMe();
  const qc = useQueryClient();
  const toast = useToast();
  const novelId = conn?.mode === "cloud" ? conn.novelId : null;
  const canEdit = cloudMe.data?.role === "editor";

  const project = useProject(!!novelId);
  const assetsQuery = useQuery({
    queryKey: ["assets", novelId, "all"],
    enabled: !!novelId,
    queryFn: () => cloudFetch<{ assets: Asset[] }>(`/api/novels/${novelId}/assets`),
  });

  const [kindFilter, setKindFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const chapters = useMemo(() => project.data?.chapters ?? [], [project.data?.chapters]);
  const sortedAssets = useMemo(() => sortAssetsNewestFirst(assetsQuery.data?.assets ?? []), [assetsQuery.data?.assets]);
  const chapterOptions = useMemo(() => buildChapterOptions(sortedAssets, chapters), [sortedAssets, chapters]);
  const missingChapterOption = chapterFilter && !chapterOptions.some((opt) => opt.value === chapterFilter);
  const chapterScoped = useMemo(() => filterAssets(sortedAssets, { chapter: chapterFilter }), [sortedAssets, chapterFilter]);
  const kindCounts = useMemo(() => countByKind(chapterScoped, KINDS, kindFilter), [chapterScoped, kindFilter]);
  const filtered = useMemo(
    () => filterAssets(sortedAssets, { kind: kindFilter, chapter: chapterFilter }),
    [sortedAssets, kindFilter, chapterFilter],
  );

  const activeIndex = selectedKey ? filtered.findIndex((a) => a.key === selectedKey) : -1;
  const active = activeIndex >= 0 ? filtered[activeIndex] : null;
  const closeLightbox = useCallback(() => setSelectedKey(null), []);

  useEffect(() => {
    if (activeIndex < 0 || filtered.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedKey(filtered[(activeIndex - 1 + filtered.length) % filtered.length].key);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedKey(filtered[(activeIndex + 1) % filtered.length].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, filtered]);

  const handleDelete = async (a: Asset) => {
    if (!novelId || !canEdit || deletingKey) return;
    if (!window.confirm(trashConfirmMessage(a))) return;
    setDeletingKey(a.key);
    try {
      await trashNovelAsset(novelId, a.key);
      setSelectedKey((key) => key === a.key ? null : key);
      toast("Đã chuyển ảnh vào thùng rác.");
      await qc.invalidateQueries({ queryKey: ["assets", novelId] });
    } catch (e) {
      toast(`Không xoá được: ${e instanceof ApiError ? e.message : e}`, "error");
    } finally {
      setDeletingKey(null);
    }
  };

  if (conn === undefined) {
    return (
      <div className="page">
        <div className="page-inner">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (!novelId) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-head">
            <div>
              <h1>Thư viện ảnh</h1>
              <div className="sub">Toàn bộ hình ảnh đã tải lên cho bộ truyện hiện tại.</div>
            </div>
          </div>
          <div className="banner info">
            <div className="b-body">
              <div className="b-title">Cần chế độ Cloudflare</div>
              <div className="small">Thư viện ảnh chỉ khả dụng khi làm việc ở chế độ Cloudflare (ảnh được lưu trên Cloudflare R2).</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeScope = active ? resolveScopeLabel(active.scope, chapters) : null;

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Thư viện ảnh</h1>
            <div className="sub">
              {assetsQuery.data
                ? `${sortedAssets.length} ảnh đã tải lên cho bộ truyện này (mới nhất trước).`
                : "Toàn bộ hình ảnh đã tải lên cho bộ truyện hiện tại."}
            </div>
          </div>
        </div>

        {assetsQuery.isLoading && (
          <div className="empty">
            <span className="spinner" />
          </div>
        )}

        {assetsQuery.error && (
          <div className="banner danger">
            <div className="b-body">{(assetsQuery.error as Error).message}</div>
          </div>
        )}

        {assetsQuery.data && sortedAssets.length === 0 && <div className="empty">Chưa có ảnh nào.</div>}

        {assetsQuery.data && sortedAssets.length > 0 && (
          <>
            <div className="gallery-toolbar">
              <div className="row">
                <select
                  className="select gallery-chapter-select"
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                  aria-label="Lọc theo chương"
                  data-testid="gallery-filter-chapter"
                >
                  <option value="">Tất cả ({sortedAssets.length})</option>
                  {missingChapterOption && (
                    <option value={chapterFilter}>{resolveScopeLabel(chapterFilter, chapters).label} (0)</option>
                  )}
                  {chapterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.count})
                    </option>
                  ))}
                </select>
                <span className="small muted" role="status">{filtered.length} ảnh</span>
              </div>

              <div className="row" style={{ gap: 4 }} data-testid="gallery-filter-kind">
                <button
                  type="button"
                  className={`btn sm ${kindFilter === "" ? "" : "ghost"}`}
                  aria-pressed={kindFilter === ""}
                  onClick={() => setKindFilter("")}
                >
                  Tất cả ({chapterScoped.length})
                </button>
                {kindCounts.map((k) => (
                  <button
                    type="button"
                    key={k.v}
                    className={`btn sm ${kindFilter === k.v ? "" : "ghost"}`}
                    aria-pressed={kindFilter === k.v}
                    onClick={() => setKindFilter(k.v)}
                  >
                    {k.label} ({k.count})
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <div>Chưa có ảnh nào.</div>
                {(kindFilter || chapterFilter) && (
                  <button
                    type="button"
                    className="btn sm"
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      setKindFilter("");
                      setChapterFilter("");
                    }}
                  >
                    Xem tất cả ảnh
                  </button>
                )}
              </div>
            ) : (
              <div className="image-grid gallery-grid" data-testid="gallery-grid">
                {filtered.map((a) => {
                  const scopeInfo = resolveScopeLabel(a.scope, chapters);
                  const title = a.caption || a.fileName;
                  return (
                    <figure key={a.key} className="version-item image-figure gallery-item" data-testid="gallery-item">
                      <button
                        type="button"
                        className="gallery-thumb-btn"
                        onClick={() => setSelectedKey(a.key)}
                        aria-label={`Xem lớn: ${title}`}
                        aria-haspopup="dialog"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh riêng tư từ R2, không qua tối ưu ảnh của Next */}
                        <img
                          src={assetUrl(a.key, novelId)}
                          alt={title}
                          loading="lazy"
                          className="gallery-thumb"
                        />
                      </button>
                      <figcaption style={{ width: "100%" }}>
                        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <span className="chip">{kindLabel(a.kind)}</span>
                          <span className="small gallery-caption" title={title}>{title}</span>
                        </div>
                        <div className="small muted gallery-scope" title={scopeInfo.label}>
                          {scopeInfo.label}
                        </div>
                        <div className="small muted">
                          {fmtDate(a.uploadedAt)} · {formatAssetSize(a.size)}
                        </div>
                        {canEdit && (
                          <div className="row" style={{ gap: 4, marginTop: 6 }}>
                            <button
                              type="button"
                              className="btn sm ghost"
                              disabled={deletingKey !== null}
                              onClick={() => void handleDelete(a)}
                            >
                              Bỏ vào thùng rác
                            </button>
                          </div>
                        )}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {active && activeScope && (
        <Modal
          title={active.caption || active.fileName}
          onClose={closeLightbox}
          testId="gallery-lightbox"
          footer={
            <>
              {filtered.length > 1 && (
                <div className="gallery-lightbox-nav">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setSelectedKey(filtered[(activeIndex - 1 + filtered.length) % filtered.length].key)}
                    aria-label="Ảnh trước"
                  >
                    ← Trước
                  </button>
                  <span className="small muted">
                    {activeIndex + 1} / {filtered.length}
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setSelectedKey(filtered[(activeIndex + 1) % filtered.length].key)}
                    aria-label="Ảnh sau"
                  >
                    Sau →
                  </button>
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="btn danger"
                  disabled={deletingKey !== null}
                  onClick={() => void handleDelete(active)}
                >
                  Bỏ vào thùng rác
                </button>
              )}
              {activeScope.chapter && (
                <Link className="btn" href={chapterHref(activeScope.chapter.id)}>
                  Mở chương
                </Link>
              )}
              <a className="btn primary" href={assetUrl(active.key, novelId)} target="_blank" rel="noreferrer">
                Mở ảnh gốc
              </a>
            </>
          }
        >
          <div className="gallery-lightbox-stage">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh riêng tư từ R2, không qua tối ưu ảnh của Next */}
            <img
              src={assetUrl(active.key, novelId)}
              alt={active.caption || active.fileName}
              className="gallery-lightbox-img"
            />
          </div>
          <dl className="kv">
            <dt>Loại ảnh</dt>
            <dd>
              <span className="chip">{kindLabel(active.kind)}</span>
            </dd>
            <dt>Phạm vi</dt>
            <dd>{activeScope.label}</dd>
            {active.caption && (
              <>
                <dt>Chú thích</dt>
                <dd>{active.caption}</dd>
              </>
            )}
            <dt>Tên tệp</dt>
            <dd className="mono small">{active.fileName}</dd>
            <dt>Dung lượng</dt>
            <dd>{formatAssetSize(active.size)}</dd>
            <dt>Tải lên</dt>
            <dd>
              {fmtDate(active.uploadedAt)}
              {active.uploadedBy ? ` · ${active.uploadedBy}` : ""}
            </dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}
