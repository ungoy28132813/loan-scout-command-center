import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inputSchema, LOCAL_AI_LIMITS, modelSchema, workerIsOnline } from "./local-ai";
import { isOfficialProductUrl, sourceText } from "./lender-research";

async function requireOwner(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_owner", { _uid: context.userId });
  if (error || data !== true) throw new Error("Owner access required");
}

export const localAiState = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireOwner(context);
  const [workers, jobs, products] = await Promise.all([
    context.supabase.from("local_ai_workers").select("id,label,model,enabled,last_seen_at,created_at").eq("owner_id", context.userId).order("created_at", { ascending: false }).limit(10),
    context.supabase.from("local_ai_jobs").select("id,product_id,model,status,result,input,error_code,review_status,created_at,expires_at,finished_at").eq("owner_id", context.userId).order("created_at", { ascending: false }).limit(30),
    context.supabase.from("lender_products").select("id,name,official_url,channel_scope").order("name"),
  ]);
  if (workers.error || jobs.error || products.error) throw new Error("Local AI workspace unavailable");
  return { workers: workers.data, jobs: jobs.data, products: products.data };
});

export const pairLocalAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ label: z.string().trim().min(1).max(80), model: modelSchema }))
  .handler(async ({ context, data }) => {
    await requireOwner(context);
    const result = await context.supabase.rpc("pair_local_ai_worker", { _label: data.label, _model: data.model });
    if (result.error) throw new Error("Unable to pair the local computer");
    return z.object({ workerId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(result.data);
  });

export const revokeLocalAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ context, data }) => {
    await requireOwner(context);
    const result = await context.supabase.rpc("revoke_local_ai_worker", { _id: data.id });
    if (result.error) throw new Error("Unable to disconnect the computer");
    return { ok: true };
  });

export const reviewLocalAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), decision: z.enum(["accepted_note", "rejected"]) })).handler(async ({ context, data }) => {
    await requireOwner(context);
    const result = await context.supabase.rpc("review_local_ai_job", { _id: data.id, _decision: data.decision });
    if (result.error) throw new Error("Unable to review this advice");
    return { ok: true };
  });

export const requestLocalAi = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ productId: z.string().uuid() })).handler(async ({ context, data }) => {
    await requireOwner(context);
    const [productResult, workerResult] = await Promise.all([
      context.supabase.from("lender_products").select("id,name,official_url,product_type,channel_scope").eq("id", data.productId).single(),
      context.supabase.from("local_ai_workers").select("id,enabled,last_seen_at").eq("owner_id", context.userId).eq("enabled", true).maybeSingle(),
    ]);
    const product = productResult.data;
    if (!product || !product.official_url) throw new Error("Choose a product with an official HTTPS source");
    if (!workerResult.data || !workerIsOnline(workerResult.data.last_seen_at, workerResult.data.enabled)) throw new Error("Your local AI computer is offline");
    let current = product.official_url;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let excerpt = "";
    try {
      let response: Response | undefined;
      for (let i = 0; i < 4; i++) {
        if (!isOfficialProductUrl(product.official_url, current)) throw new Error("Source must stay on the official lender website");
        response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { Accept: "text/html,text/plain" } });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("Unreadable lender source");
        current = new URL(location, current).toString();
      }
      if (!response?.ok || !/^text\/(html|plain)\b/i.test(response.headers.get("content-type") ?? "") || !response.body) throw new Error("This lender source needs manual review; no AI request was created");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let raw = ""; let size = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > 1_000_000) throw new Error("Lender source too large; use manual review");
          raw += decoder.decode(part.value, { stream: true });
        }
      } finally { await reader.cancel(); }
      excerpt = sourceText(raw + decoder.decode(), LOCAL_AI_LIMITS.sourceChars);
      if (!excerpt) throw new Error("No readable public source; use manual review");
    } catch (error) {
      if (error instanceof Error && error.message.includes("manual")) throw error;
      throw new Error("Could not retrieve the public source; no AI request was created");
    } finally { clearTimeout(timeout); }
    const sha = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(excerpt));
    const sha256 = Array.from(new Uint8Array(sha), (b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counts = await supabaseAdmin.rpc("local_ai_outcome_context", { _product_id: product.id });
    if (counts.error) throw new Error("Verified outcome context unavailable");
    const input = inputSchema.parse({ product: { name: product.name, type: product.product_type, scope: product.channel_scope ?? "Scope not specified", url: current, checkedAt: new Date().toISOString().slice(0, 10) }, source: { excerpt, sha256 }, outcomes: counts.data });
    const queued = await supabaseAdmin.rpc("enqueue_local_ai_job", { _owner_id: context.userId, _product_id: product.id, _input: input });
    if (queued.error) {
      const known = ["offline", "current analysis", "Daily limit"];
      throw new Error(known.some((m) => queued.error?.message.includes(m)) ? queued.error.message : "Unable to queue local analysis");
    }
    return z.object({ jobId: z.string().uuid(), cached: z.boolean() }).parse(queued.data);
  });