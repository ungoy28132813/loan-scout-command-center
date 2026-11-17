/** Text normalization and sensitive-data masking. Nothing here logs or persists text. */
export function normalizeLine(s: string): string {
  return s.replace(/[\u00a0\u2007\u202f]/g, " ").replace(/[®™©]/g, "").replace(/[‐‑‒–—]/g, "-").replace(/\t/g, "   ").replace(/ {2,}/g, (m) => (m.length >= 3 ? "   " : " ")).trim();
}

/** Masks SSNs, long digit runs and partially masked account numbers, keeping at most the last 4 digits. */
export function maskSensitive(s: string): string {
  return s
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "***-**-****")
    .replace(/\b(?:x{3}|\*{3})-?(?:x{2}|\*{2})-?\d{4}\b/gi, "***-**-****")
    .replace(/[0-9Xx*•]{5,}(\d{4})\b/g, (_m, l4) => `••••${l4}`)
    .replace(/\b\d{9,}\b/g, "•••••••••");
}

/** Last 4 digits of an account reference only when the visible token ends in 4 digits. */
export function last4(token: string | null | undefined): string | null {
  if (!token) return null;
  const t = token.replace(/\s+/g, "");
  if (/^-+$|^n\/?a$/i.test(t)) return null;
  const m = t.match(/(\d{4})$/);
  return m ? m[1]! : null;
}

/** Values in a table row: money, numbers, percents, or blank markers ("-", "--", "N/A"). */
export function rowValues(rest: string): (number | null)[] {
  const toks = rest.match(/\$?-?\d[\d,]*(?:\.\d+)?%?|--?|n\/a|not reported/gi) ?? [];
  return toks.map((t) => {
    if (/^--?$|^n\/a$|^not reported$/i.test(t)) return null;
    const n = Number(t.replace(/[$,%]/g, ""));
    return Number.isFinite(n) ? n : null;
  });
}

export function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
