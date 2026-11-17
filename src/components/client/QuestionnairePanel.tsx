import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { neededQuestions, type Question } from "@/lib/questionnaire";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";

/** Rule keys are passed in by staff views (from active rules). Clients get keys via goals/reports only. */
export function QuestionnairePanel({ clientId, ruleKeys, staff, onChanged }: { clientId: string; ruleKeys: string[]; staff: boolean; onChanged?: () => void }) {
  const qc = useQueryClient();
  const ctx = useQuery({
    queryKey: ["qa", clientId],
    queryFn: async () => {
      const [a, g, r] = await Promise.all([
        supabase.from("questionnaire_answers").select("*").eq("client_id", clientId),
        supabase.from("funding_goals").select("goal_type").eq("client_id", clientId),
        supabase.from("credit_reports").select("id").eq("client_id", clientId).limit(1),
      ]);
      return { answers: a.data ?? [], hasBusiness: (g.data ?? []).some((x) => x.goal_type === "business"), hasReport: (r.data ?? []).length > 0 };
    },
  });
  if (!ctx.data) return null;
  const keys = staff ? ruleKeys : [...ruleKeys, "max_dti_pct"];
  const qs = neededQuestions({ ruleKeys: keys, hasBusinessGoal: ctx.data.hasBusiness, hasReport: ctx.data.hasReport });
  return (
    <Card>
      <CardHeader><CardTitle className="label-caps">Financial questions</CardTitle>
        <p className="text-sm text-muted-foreground">Only questions relevant to the current goals, reports and cited lender requirements are shown. You can always choose “I don’t know / Skip for now”.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {qs.length === 0 && <p className="text-sm text-muted-foreground">No questions needed right now.</p>}
        {qs.map((q) => <QRow key={q.key} q={q} clientId={clientId} staff={staff} existing={ctx.data!.answers.find((a) => a.question_key === q.key)} onSaved={() => { qc.invalidateQueries({ queryKey: ["qa", clientId] }); onChanged?.(); }} />)}
      </CardContent>
    </Card>
  );
}

function QRow({ q, clientId, existing, staff, onSaved }: { q: Question; clientId: string; staff: boolean; existing?: { value_numeric: number | null; value_text: string | null; status: string; verified: boolean }; onSaved: () => void }) {
  const [v, setV] = useState(existing ? String(existing.value_numeric ?? existing.value_text ?? "") : "");
  const save = async (skip: boolean, verify = false) => {
    const num = q.kind === "number" && !skip ? Number(v) : null;
    if (!skip && q.kind === "number" && (v.trim() === "" || Number.isNaN(num))) return toast.error("Enter a number or choose Skip");
    const { error } = await supabase.from("questionnaire_answers").upsert({
      client_id: clientId, question_key: q.key, value_numeric: skip ? null : num, value_text: skip || q.kind === "number" ? null : v.slice(0, 500),
      status: skip ? "skipped" : "answered", verified: staff && verify && !skip, updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,question_key" });
    if (error) return toast.error(error.message);
    if (skip) setV("");
    toast.success(skip ? "Marked unknown" : "Saved");
    onSaved();
  };
  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium" htmlFor={q.key}>{q.label}</label>
        <div className="flex gap-1">
          <StatusBadge value={existing?.status === "answered" ? (existing.verified ? "verified" : "pending") : "unknown"} label={existing?.status === "answered" ? (existing.verified ? "Verified" : "Unverified") : "Unknown"} />
        </div>
      </div>
      {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Input id={q.key} className="max-w-xs" inputMode={q.kind === "number" ? "decimal" : "text"} value={v} onChange={(e) => setV(e.target.value)} />
        <Button size="sm" onClick={() => save(false)}>Save</Button>
        {staff && <Button size="sm" variant="secondary" onClick={() => save(false, true)}>Save as verified</Button>}
        <Button size="sm" variant="outline" onClick={() => save(true)}>I don’t know / Skip for now</Button>
      </div>
    </div>
  );
}
