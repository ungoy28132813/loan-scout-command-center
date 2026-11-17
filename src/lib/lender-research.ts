export const RESEARCH_TEXT_LIMIT = 12_000;
export const RESEARCH_RESPONSE_LIMIT = 1_000_000;
export const RESEARCH_STALE_DAYS = 180;

export function validHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hostname(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

/** Retrieval is restricted to the official product host or its subdomains. */
export function isOfficialProductUrl(productUrl: string, candidateUrl: string): boolean {
  if (!validHttpsUrl(productUrl) || !validHttpsUrl(candidateUrl)) return false;
  const official = hostname(productUrl);
  const candidate = hostname(candidateUrl);
  return candidate === official || candidate.endsWith(`.${official}`);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const number = Number.parseInt(code.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

/** Converts public HTML to bounded review text; no AI interpretation or rule extraction. */
export function sourceText(html: string, limit = RESEARCH_TEXT_LIMIT): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function researchIsStale(sourceCheckedOn: string, now = new Date()): boolean {
  const checked = new Date(`${sourceCheckedOn}T00:00:00Z`);
  return Number.isNaN(checked.getTime()) || now.getTime() - checked.getTime() > RESEARCH_STALE_DAYS * 86_400_000;
}
