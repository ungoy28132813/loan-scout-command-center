import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isOfficialProductUrl, RESEARCH_RESPONSE_LIMIT, sourceText } from "@/lib/lender-research";

async function requireResearchPermission(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const [{ data: owner }, { data: permitted }] = await Promise.all([
    context.supabase.rpc("is_owner", { _uid: context.userId }),
    context.supabase.rpc("has_perm", { _uid: context.userId, _perm: "can_propose_rules" }),
  ]);
  if (owner !== true && permitted !== true) throw new Error("Lender research permission required");
}

async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > RESEARCH_RESPONSE_LIMIT) throw new Error("The source page is too large; submit a manual excerpt instead");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > RESEARCH_RESPONSE_LIMIT) {
      await reader.cancel();
      throw new Error("The source page is too large; submit a manual excerpt instead");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export const fetchLenderSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ productId: z.string().uuid(), url: z.string().min(12).max(2000) }))
  .handler(async ({ data, context }) => {
    await requireResearchPermission(context);
    const { data: product, error } = await context.supabase
      .from("lender_products")
      .select("id, official_url")
      .eq("id", data.productId)
      .single();
    if (error || !product?.official_url) throw new Error("The product needs an official HTTPS page before retrieval");
    if (!isOfficialProductUrl(product.official_url, data.url)) throw new Error("Retrieval is limited to this product's official website");

    let current = new URL(data.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      let response: Response | null = null;
      for (let redirects = 0; redirects < 4; redirects++) {
        response = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: { Accept: "text/html, text/plain, application/xhtml+xml", "User-Agent": "LoanScout-Source-Review/1.0" },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("The official page returned an invalid redirect");
        current = new URL(location, current);
        if (!isOfficialProductUrl(product.official_url, current.toString())) throw new Error("The official page redirected outside the approved website");
      }
      if (!response) throw new Error("The official page could not be retrieved");
      if (!response.ok) return { ok: false as const, error: `The official page returned HTTP ${response.status}; submit a manual excerpt instead` };
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!/^text\/(html|plain)\b|^application\/xhtml\+xml\b/.test(contentType)) {
        return { ok: false as const, error: "This file type needs manual source review; paste a short excerpt and page reference" };
      }
      const raw = await readBoundedText(response);
      const excerpt = sourceText(raw);
      if (!excerpt) return { ok: false as const, error: "No readable public text was found; submit a manual excerpt instead" };
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      const contentSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      return { ok: true as const, url: current.toString(), excerpt, contentSha256, retrievedAt: new Date().toISOString() };
    } catch (cause) {
      if (cause instanceof Error && (cause.name === "AbortError" || cause.message.includes("manual") || cause.message.includes("official") || cause.message.includes("large"))) {
        return { ok: false as const, error: cause.name === "AbortError" ? "The official page took too long to respond; submit a manual excerpt instead" : cause.message };
      }
      return { ok: false as const, error: "The official page could not be retrieved; submit a manual excerpt instead" };
    } finally {
      clearTimeout(timeout);
    }
  });
