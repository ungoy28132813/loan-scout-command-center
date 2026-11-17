export const ORPHAN_CLEANUP_MIN_AGE_MS = 15 * 60 * 1000;

const SAFE_ORPHAN_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|png|jpg)$/i;

export interface OrphanedFile {
  path: string;
  fileName: string;
  createdAt: string | null;
  sizeBytes: number;
  mimeType: string;
  eligibleForCleanup: boolean;
}

export function isSafeOrphanPath(path: string): boolean {
  return SAFE_ORPHAN_PATH.test(path);
}

export function isCleanupEligible(createdAt: string | null, now = Date.now()): boolean {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && now - timestamp >= ORPHAN_CLEANUP_MIN_AGE_MS;
}
