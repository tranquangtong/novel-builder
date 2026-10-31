// Trang tĩnh (GitHub Pages) không có route động theo ID → dùng query string.
export const chapterHref = (id: string) => `/chapter?id=${encodeURIComponent(id)}`;
export const proposalHref = (n: number) => `/proposal?n=${n}`;
