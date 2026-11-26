export type Bureau = "experian" | "equifax" | "transunion";
export const BUREAUS: Bureau[] = ["transunion", "experian", "equifax"];
export type Confidence = "high" | "medium" | "low";

/** One page of reconstructed text lines (kept in memory only; never persisted). */
export interface PageText { page: number; lines: string[] }

export interface ExtractedScore {
  bureau: Bureau;
  /** Exact model as printed, normalized to a known label; null when the report did not state it. */
  model: string | null;
  value: number;
  scoreDate: string | null;
  page: number;
  confidence: Confidence;
  needsReview: boolean;
  evidence: string; // label-only description, never values or identifiers
}
export interface ExtractedField {
  bureau: Bureau; key: string; value: number; page: number; confidence: Confidence; needsReview: boolean; evidence: string;
}
export interface ExtractedTradeline {
  bureau: Bureau;
  creditor: string;
  last4: string | null;
  accountType: string | null;
  balance: number | null;
  creditLimit: number | null;
  isOpen: boolean | null;
  lateCount: number | null;
  isCollection: boolean;
  isChargeoff: boolean;
  reconcileKey: string;
  page: number;
  needsReview: boolean;
}
export type ExtractionStatus = "awaiting_manual_entry" | "partial" | "unreadable" | "complete_unverified";

export interface ParseDiagnostics {
  layout: "classic_3b" | "ultra_4k_3b";
  accountBlocks: number;
  inquiryEntries: number;
  inquiriesReconciled: boolean;
  paymentCells: number;
  paymentCellsClassified: number;
}

export interface ParseResult {
  parserVersion: string;
  provider: "smartcredit" | "identityiq" | "myscoreiq" | "unknown";
  bureausDetected: Bureau[];
  reportType: "tri_merge" | Bureau | "unknown";
  reportDate: string | null;
  pageCount: number;
  /** Whether the original PDF had a usable text layer; OCR does not change this provenance. */
  hasTextLayer: boolean;
  /** Whether any page was recognized by the bundled browser-local English OCR engine. */
  ocrUsed: boolean;
  scores: ExtractedScore[];
  fields: ExtractedField[];
  tradelines: ExtractedTradeline[];
  warnings: string[];
  status: ExtractionStatus;
  /** Counts-only coordinate checks; never contains report text or client identifiers. */
  diagnostics?: ParseDiagnostics;
}
