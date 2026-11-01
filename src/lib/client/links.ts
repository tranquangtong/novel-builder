// Trang tĩnh (GitHub Pages) không có route động theo ID → dùng query string.
export const chapterHref = (id: string) => `/chapter?id=${encodeURIComponent(id)}`;
export const proposalHref = (n: number) => `/proposal?n=${n}`;

/** Nơi lưu phiên bản, theo repoKey của kho: dùng trong thông báo “Đã lưu … ”. */
export function storageLabel(repoKey: string | undefined): { into: string; at: string } {
  if (!repoKey || repoKey === "demo") return { into: "vào kho demo", at: "trong kho demo" };
  if (repoKey.startsWith("cloud:")) return { into: "lên Cloudflare", at: "trên Cloudflare" };
  return { into: "lên GitHub", at: "lên GitHub" };
}
