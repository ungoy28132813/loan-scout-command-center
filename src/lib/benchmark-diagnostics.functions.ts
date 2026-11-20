import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RECOVERY_IDS } from "./benchmark-diagnostics";

export const benchmarkDiagnosisHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const role = await context.supabase.rpc("is_owner", { _uid: context.userId });
  if (role.error || role.data !== true) throw new Error("Owner access required");
  const [runs, control] = await Promise.all([
    context.supabase.from("benchmark_diagnostics").select("id,symptoms,status,result,error_message,recovery_id,recovery_outcome,created_at,confirmed_at").eq("owner_id", context.userId).order("created_at", { ascending: false }).limit(30),
    context.supabase.from("benchmark_ai_controls").select("paused,pause_kind,message").eq("id", context.userId).maybeSingle(),
  ]);
  if (runs.error || control.error) throw new Error("Benchmark history unavailable");
  return { runs: runs.data, control: control.data };
});
export const confirmBenchmarkRecovery = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), recoveryId: z.enum(RECOVERY_IDS), outcome: z.enum(["resolved", "not_resolved"]) }).strict())
  .handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("confirm_benchmark_recovery", { _id: data.id, _recovery: data.recoveryId, _outcome: data.outcome });
    if (result.error) throw new Error("Unable to confirm this recovery");
    return { ok: true };
  });
export const resumeBenchmarkDiagnosis = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const result = await context.supabase.rpc("resume_benchmark_diagnosis");
  if (result.error) throw new Error("Unable to resume hosted diagnosis");
  return { ok: true };
});
export const stopBenchmarkDiagnosis = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).strict()).handler(async ({ context, data }) => {
    const result = await context.supabase.rpc("stop_benchmark_diagnosis", { _id: data.id });
    if (result.error) throw new Error("Unable to release this analysis");
    return { ok: true };
  });