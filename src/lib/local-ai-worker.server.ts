import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { adviceSchema, inputSchema, LOCAL_AI_SYSTEM, validateAdvice } from "./local-ai";

const exchangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("poll") }).strict(),
  z.object({ action: z.literal("complete"), jobId: z.string().uuid(), leaseId: z.string().uuid(), result: adviceSchema }).strict(),
  z.object({ action: z.literal("failed"), jobId: z.string().uuid(), leaseId: z.string().uuid(), errorCode: z.enum(["model_unavailable", "invalid_output", "local_timeout", "local_error"]) }).strict(),
]);
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function exchangeLocalWorker(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) return Response.json({ error: "Unavailable" }, { status: 503, headers });
  const publicClient = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key);
    return fetch(input, { ...init, headers: h });
  } } });
  const verified = await publicClient.rpc("verify_local_ai_token", { _token: token });
  if (verified.error || verified.data !== true) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 20_000 || !request.body) return Response.json({ error: "Invalid payload" }, { status: 400, headers });
  let raw = ""; let size = 0; const reader = request.body.getReader(); const decoder = new TextDecoder();
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 20_000) throw new Error("Payload too large"); raw += decoder.decode(part.value, { stream: true }); }
    raw += decoder.decode();
  } catch { return Response.json({ error: "Invalid payload" }, { status: 400, headers }); }
  finally { await reader.cancel(); }
  const parsed = exchangeSchema.safeParse((() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })());
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400, headers });
  const data = parsed.data;
  // The credential has been verified before privileged code loads; the SQL RPC rechecks it atomically.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (data.action === "complete") {
    // Scope the read before loading any job input.
    const worker = await supabaseAdmin.from("local_ai_workers").select("id").eq("token_hash", Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), (b) => b.toString(16).padStart(2, "0")).join("")).eq("enabled", true).maybeSingle();
    if (!worker.data) return Response.json({ error: "Job unavailable" }, { status: 409, headers });
    const job = await supabaseAdmin.from("local_ai_jobs").select("input").eq("id", data.jobId).eq("worker_id", worker.data.id).maybeSingle();
    if (!job.data) return Response.json({ error: "Job unavailable" }, { status: 409, headers });
    try { validateAdvice(data.result, inputSchema.parse(job.data.input)); }
    catch { return Response.json({ error: "Invalid evidence" }, { status: 422, headers }); }
  }
  const response = await supabaseAdmin.rpc("local_ai_worker_exchange", {
    _token: token, _action: data.action === "poll" ? "poll" : "complete",
    ...(data.action !== "poll" ? { _job_id: data.jobId, _lease_id: data.leaseId } : {}),
    ...(data.action === "complete" ? { _result: data.result } : {}),
    ...(data.action === "failed" ? { _error_code: data.errorCode } : {}),
  });
  if (response.error) return Response.json({ error: "Job unavailable" }, { status: 409, headers });
  return Response.json(data.action === "poll" ? { ...z.object({ job: z.unknown().nullable() }).parse(response.data), system: LOCAL_AI_SYSTEM } : { ok: true }, { headers });
}