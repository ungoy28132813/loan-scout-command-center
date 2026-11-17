import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Bureau, Confidence, ParseResult } from "./types";

/** Structured data only: no evidence strings, warnings, raw text, reconcile keys, or account identifiers beyond last4. */
export interface ClientExtractionPayload {
  parserVersion: string;
  provider: ParseResult["provider"];
  reportType: ParseResult["reportType"];
  reportDate: string | null;
  pageCount: number;
  hasTextLayer: boolean;
  bureausDetected: Bureau[];
  status: ParseResult["status"];
  scores: { bureau: Bureau; model: string | null; value: number; scoreDate: string | null; sourcePage: number; confidence: Confidence; needsReview: boolean }[];
  fields: { bureau: Bureau; key: string; value: number; sourcePage: number; confidence: Confidence; needsReview: boolean }[];
  tradelines: { bureau: Bureau; creditor: string; last4: string | null; accountType: string | null; balance: number | null; creditLimit: number | null; isOpen: boolean | null; isCollection: boolean; sourcePage: number; needsReview: boolean }[];
}

export function buildClientExtractionPayload(r: ParseResult): ClientExtractionPayload {
  return {
    parserVersion: r.parserVersion,
    provider: r.provider,
    reportType: r.reportType,
    reportDate: r.reportDate,
    pageCount: r.pageCount,
    hasTextLayer: r.hasTextLayer,
    bureausDetected: [...r.bureausDetected],
    status: r.status,
    scores: r.scores.map((s) => ({ bureau: s.bureau, model: s.model, value: s.value, scoreDate: s.scoreDate, sourcePage: s.page, confidence: s.confidence, needsReview: s.needsReview })),
    fields: r.fields.map((f) => ({ bureau: f.bureau, key: f.key, value: f.value, sourcePage: f.page, confidence: f.confidence, needsReview: f.needsReview })),
    tradelines: r.tradelines.map((t) => ({ bureau: t.bureau, creditor: t.creditor, last4: t.last4, accountType: t.accountType, balance: t.balance, creditLimit: t.creditLimit, isOpen: t.isOpen, isCollection: t.isCollection, sourcePage: t.page, needsReview: t.needsReview })),
  };
}

/** The database revalidates ownership, consent, PDF identity, payload shape, and one-submission idempotency. */
export async function submitClientExtraction(reportId: string, result: ParseResult): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = buildClientExtractionPayload(result);
  const { error } = await supabase.rpc("submit_client_extraction", {
    _report_id: reportId,
    _idempotency_key: reportId,
    _payload: payload as unknown as Json,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
