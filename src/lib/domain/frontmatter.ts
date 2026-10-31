import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface Parsed {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

/**
 * Tách frontmatter YAML ở đầu file. Phần thân được giữ nguyên từng ký tự
 * (không trim, không chuẩn hóa) để bảo toàn nguyên văn.
 */
export function parseFrontmatter(text: string): Parsed {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  let data: unknown;
  try {
    data = parseYaml(m[1]) ?? {};
  } catch (e) {
    throw new FrontmatterError(`Frontmatter YAML không hợp lệ: ${(e as Error).message}`);
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new FrontmatterError("Frontmatter phải là một object YAML");
  }
  return { data: data as Record<string, unknown>, body: text.slice(m[0].length), hasFrontmatter: true };
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== "") clean[k] = v;
  const yaml = stringifyYaml(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}

export class FrontmatterError extends Error {}
