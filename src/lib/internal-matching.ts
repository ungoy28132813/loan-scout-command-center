import { supabase } from "@/integrations/supabase/client";
import { loadFacts } from "@/lib/facts";
import { scopeProductsToGoal, type GoalType } from "@/lib/business-funding";
import { ENGINE_VERSION, evaluateProduct, type Rule } from "@/lib/match-engine";

/** Creates fresh internal draft runs after validated evidence changes. Never modifies or publishes snapshots. */
export async function recalculateInternalMatches(clientId: string): Promise<{ runs: number; goals: number }> {
  const { data: goals, error: goalError } = await supabase.from("funding_goals").select("id, goal_type").eq("client_id", clientId).order("created_at");
  if (goalError) throw new Error(goalError.message);
  if (!goals?.length) return { runs: 0, goals: 0 };

  const [productsResult, rulesResult] = await Promise.all([
    supabase.from("lender_products").select("id, product_type"),
    supabase.from("lender_rules").select("*").eq("approval_status", "active"),
  ]);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (rulesResult.error) throw new Error(rulesResult.error.message);

  let runs = 0;
  for (const goal of goals) {
    const products = scopeProductsToGoal(productsResult.data ?? [], goal.goal_type as GoalType, false);
    if (!products.length) continue;
    const facts = await loadFacts(clientId, goal.id);
    const warnings = [...facts.criticalWarnings];
    const { data: run, error: runError } = await supabase.from("match_runs").insert({
      client_id: clientId,
      goal_id: goal.id,
      mode: "strict",
      engine_version: ENGINE_VERSION,
      critical_warnings: warnings,
    }).select("id").single();
    if (runError || !run) throw new Error(runError?.message ?? "Could not create an internal match run");

    const evaluations = products.map((product) => ({
      product,
      evaluation: evaluateProduct((rulesResult.data ?? []).filter((rule) => rule.product_id === product.id) as unknown as Rule[], facts, "strict"),
    }));
    evaluations.sort((a, b) => (b.evaluation.score ?? -1) - (a.evaluation.score ?? -1));
    const rows = evaluations.map(({ product, evaluation }, index) => ({
      run_id: run.id,
      client_id: clientId,
      product_id: product.id,
      status: evaluation.status,
      suitability_score: evaluation.score,
      conditions: { list: evaluation.conditions, summary: evaluation.summary, steps: evaluation.improvement_steps } as never,
      rank: index + 1,
    }));
    const { error: resultError } = await supabase.from("match_results").insert(rows);
    if (resultError) throw new Error(resultError.message);
    runs++;
  }
  return { runs, goals: goals.length };
}
