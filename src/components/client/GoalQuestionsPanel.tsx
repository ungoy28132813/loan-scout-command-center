import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { GoalType } from "@/lib/business-funding";
import { goalQuestions, type GoalQuestion } from "@/lib/goal-questions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";

type GoalAnswer = Tables<"goal_questionnaire_answers">;

export function GoalQuestionsPanel({ clientId, goalId, goalType, staff }: { clientId: string; goalId: string; goalType: GoalType; staff: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["goal-answers", goalId, staff],
    queryFn: async () => {
      const answers = await supabase.from("goal_questionnaire_answers").select("*").eq("client_id", clientId).eq("goal_id", goalId);
      if (answers.error) throw new Error(answers.error.message);
      const rules = staff
        ? await supabase.from("lender_rules").select("rule_key, input_key, requires_verified_facts").eq("approval_status", "active")
        : await supabase.rpc("active_goal_question_definitions");
      if (rules.error) throw new Error(rules.error.message);
      return { answers: answers.data ?? [], rules: rules.data ?? [] };
    },
  });
  if (!query.data) return <p className="mt-3 text-xs text-muted-foreground">Loading goal-specific questions…</p>;
  const questions = goalQuestions(goalType, query.data.rules);
  const saved = () => {
    qc.invalidateQueries({ queryKey: ["goal-answers", goalId] });
    qc.invalidateQueries({ queryKey: ["matching", clientId] });
  };
  return <div className="mt-3 space-y-3 rounded bg-muted/30 p-3">
    <div>
      <div className="label-caps text-muted-foreground">Conditional questions for this exact goal</div>
      <p className="mt-1 text-xs text-muted-foreground">Answers never transfer to another goal or business. Unknown stays null, self-reported stays unverified, and saving never publishes recommendations.</p>
    </div>
    {questions.map((question) => {
      const existing = query.data!.answers.find((answer) => answer.question_key === question.key);
      return <GoalAnswerRow key={`${question.key}-${existing?.updated_at ?? "new"}`} clientId={clientId} goalId={goalId} question={question} existing={existing} staff={staff} onSaved={saved} />;
    })}
  </div>;
}

function GoalAnswerRow({ clientId, goalId, question, existing, staff, onSaved }: { clientId: string; goalId: string; question: GoalQuestion; existing?: GoalAnswer | undefined; staff: boolean; onSaved: () => void }) {
  const [value, setValue] = useState(existing?.value_numeric == null ? existing?.value_text ?? "" : String(existing.value_numeric));
  const [busy, setBusy] = useState(false);
  const save = async (skip: boolean, verify = false) => {
    const trimmed = value.trim();
    if (!skip && !trimmed) return void toast.error("Enter an answer or choose Skip");
    if (!skip && question.kind === "number" && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0)) return void toast.error("Enter a valid non-negative number or choose Skip");
    setBusy(true);
    const numeric = !skip && question.kind === "number" ? Number(trimmed) : null;
    const text = !skip && question.kind !== "number" ? (question.key === "location_state" ? trimmed.toUpperCase() : trimmed).slice(0, 500) : null;
    const { error } = await supabase.from("goal_questionnaire_answers").upsert({
      client_id: clientId,
      goal_id: goalId,
      question_key: question.key,
      value_numeric: numeric,
      value_text: text,
      status: skip ? "skipped" : "answered",
      verified: staff && verify && !skip,
      financial_source: staff ? "staff_entered" : "self_reported",
    }, { onConflict: "goal_id,question_key" });
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (skip) setValue("");
    toast.success(skip ? "Marked Unknown; no value was inferred" : verify ? "Verified answer saved; nothing was published" : "Saved for this goal only; nothing was published");
    onSaved();
  };
  const statusLabel = existing?.status === "answered" ? existing.verified ? `Verified · ${existing.financial_source.replaceAll("_", " ")}` : `Unverified · ${existing.financial_source.replaceAll("_", " ")}` : "Unknown";
  return <div className="rounded border bg-background p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="text-sm font-medium" htmlFor={`${goalId}-${question.key}`}>{question.label}</label>
      <StatusBadge value={existing?.status === "answered" ? existing.verified ? "verified" : "pending" : "unknown"} label={statusLabel} />
    </div>
    {(question.help || question.verificationRequired) && <p className="mt-1 text-xs text-muted-foreground">{question.help} {question.verificationRequired && "An active rule requires staff-verified evidence; an unverified answer remains Unknown for that condition."}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {question.kind === "application" || question.kind === "yes_no" ? <Select value={value} onValueChange={setValue}><SelectTrigger id={`${goalId}-${question.key}`} className="w-64"><SelectValue placeholder="Unknown / choose an answer" /></SelectTrigger><SelectContent>{question.kind === "application" ? <><SelectItem value="individual">Individual application</SelectItem><SelectItem value="joint">Joint application</SelectItem></> : <><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></>}</SelectContent></Select> : <Input id={`${goalId}-${question.key}`} className="max-w-xs" type={question.kind === "number" ? "number" : "text"} min={question.kind === "number" ? 0 : undefined} step={question.kind === "number" ? "any" : undefined} maxLength={question.kind === "text" ? 500 : undefined} placeholder="Unknown" value={value} onChange={(event) => setValue(event.target.value)} />}
      <Button size="sm" disabled={busy} onClick={() => save(false)}>Save</Button>
      {staff && <Button size="sm" variant="secondary" disabled={busy} onClick={() => save(false, true)}>Save as verified</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => save(true)}>I don’t know / Skip for now</Button>
    </div>
  </div>;
}
