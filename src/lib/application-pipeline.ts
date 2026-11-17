import { APP_STATUSES } from "@/lib/labels";

export type ApplicationMetricRow = {
  id: string;
  status: string;
  statusDate: string;
  isDemo: boolean;
  outcomeVerification?: string | null;
};

export type StatusCounts = Record<(typeof APP_STATUSES)[number]["value"], number>;

const zeroCounts = (): StatusCounts => ({ not_started: 0, submitted: 0, pending: 0, approved: 0, denied: 0 });

export function monthlyApplicationMetrics(rows: ApplicationMetricRow[], month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM format");
  const counts = zeroCounts();
  const verifiedCounts = zeroCounts();
  let total = 0;
  let verifiedTotal = 0;
  for (const row of rows) {
    const status = APP_STATUSES.find((item) => item.value === row.status)?.value;
    if (row.isDemo || !status || !Number.isFinite(Date.parse(row.statusDate)) || row.statusDate.slice(0, 7) !== month) continue;
    counts[status] += 1;
    total += 1;
    if (row.outcomeVerification === "staff_verified") {
      verifiedCounts[status] += 1;
      verifiedTotal += 1;
    }
  }
  return { month, counts, verifiedCounts, total, verifiedTotal };
}

export function shiftMonth(month: string, offset: number) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Month must use YYYY-MM format");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function hasVerifiedApplicationUrl(product: {
  application_url: string | null;
  application_url_source_url: string | null;
  application_url_verified_on: string | null;
}) {
  if (!product.application_url || !product.application_url_source_url || !product.application_url_verified_on) return false;
  try {
    const url = new URL(product.application_url);
    const source = new URL(product.application_url_source_url);
    return url.protocol === "https:" && source.protocol === "https:" && !url.username && !url.password && url.pathname !== "" && url.pathname !== "/";
  } catch {
    return false;
  }
}

export function guidanceItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
