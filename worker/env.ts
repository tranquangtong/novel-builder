export interface Env {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  DB: D1Database;
  /** https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) Tag của ứng dụng Access */
  ACCESS_AUD?: string;
  /** Email được quyền sửa, cách nhau bằng dấu phẩy. Người vào được qua Access nhưng không có trong danh sách → chỉ đọc. */
  EDITOR_EMAILS?: string;
  /** Client ID của service token dành cho agent, cách nhau bằng dấu phẩy. */
  AGENT_CLIENT_IDS?: string;
  /** CHỈ dùng khi chạy local (wrangler dev): bỏ qua Access cho host localhost. */
  DEV_AUTH_EMAIL?: string;
}
