const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // base32 Crockford, chữ thường

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** ID ổn định, không phụ thuộc tên hay vị trí. Ví dụ: ch_8k3m2q9x4t */
export function newId(prefix: "ch" | "act" | "fact", rand: () => Uint8Array = () => randomBytes(10)): string {
  const bytes = rand();
  let s = "";
  for (let i = 0; i < 10; i++) s += ALPHABET[bytes[i] % 32];
  return `${prefix}_${s}`;
}

export const ID_PATTERN = /^(ch|act|fact)_[0-9a-z_-]{3,40}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_PATTERN.test(id);
}
