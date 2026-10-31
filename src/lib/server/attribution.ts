/** Ở chế độ GitHub, bình luận được gửi bằng danh tính GitHub App (bot) nên ghi rõ người viết. */
export function attributed(kind: "demo" | "github", login: string, text: string) {
  return kind === "github" ? `${text}\n\n— ${login} (gửi qua The Last Miracle Studio)` : text;
}
