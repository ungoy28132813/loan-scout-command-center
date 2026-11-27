import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { MissingGoalInput } from "@/lib/missing-inputs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function QuickFillInputs({
  clientId,
  goalId,
  inputs,
  staff,
  onSaved,
}: {
  clientId: string;
  goalId: string;
  inputs: MissingGoalInput[];
  staff: boolean;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = inputs.filter((item) => !dismissed.has(item.key));
  if (!visible.length) return null;

  const saveOne = async (item: MissingGoalInput, skip: boolean, verify = false) => {
    const raw = (values[item.key] ?? "").trim();
    if (!skip && !raw) return void toast.error(`Enter ${item.shortLabel} or choose Skip`);
    if (!skip && item.kind === "number" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
      return void toast.error("Enter a valid non-negative number or choose Skip");
    }
    setBusyKey(item.key);
    const numeric = !skip && item.kind === "number" ? Number(raw) : null;
    const text = !skip && item.kind !== "number" ? (item.key === "location_state" ? raw.toUpperCase() : raw).slice(0, 500) : null;
    const { error } = await supabase.from("goal_questionnaire_answers").upsert(
      {
        client_id: clientId,
        goal_id: goalId,
        question_key: item.key,
        value_numeric: numeric,
        value_text: text,
        status: skip ? "skipped" : "answered",
        verified: staff && verify && !skip,
        financial_source: staff ? "staff_entered" : "self_reported",
      },
      { onConflict: "goal_id,question_key" }
    );
    if (error) {
      setBusyKey(null);
      return void toast.error(error.message);
    }
    if (skip) {
      setDismissed((prev) => new Set(prev).add(item.key));
      toast.success(`Kept ${item.shortLabel} as Unknown`);
      setBusyKey(null);
      return;
    }
    toast.success(`Saved ${item.shortLabel} — recalculating matches…`);
    await onSaved();
    setBusyKey(null);
  };

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="label-caps text-primary">Quick-fill missing non-credit inputs</CardTitle>
        <p className="text-xs text-muted-foreground">
          Credit scores, inquiries, utilization, and accounts are already pulled from the credit report. Only missing income or goal details needed by active lender rules appear below. Skip any unknown — unknown never disqualifies.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.map((item) => {
          const val = values[item.key] ?? "";
          const busy = busyKey === item.key;
          return (
            <div key={item.key} className="rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium" htmlFor={`qf-${item.key}`}>{item.label}</label>
                <span className="text-xs text-muted-foreground">
                  Needed by {item.affectedProducts.slice(0, 2).join(", ")}{item.affectedProducts.length > 2 ? ` +${item.affectedProducts.length - 2}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.help}{item.requiresVerified ? " Requires staff verification for that rule." : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.kind === "application" || item.kind === "yes_no" ? (
                  <Select value={val} onValueChange={(v) => setValues((prev) => ({ ...prev, [item.key]: v }))}>
                    <SelectTrigger id={`qf-${item.key}`} className="w-56"><SelectValue placeholder="Choose or skip" /></SelectTrigger>
                    <SelectContent>
                      {item.kind === "application" ? (
                        <><SelectItem value="individual">Individual application</SelectItem><SelectItem value="joint">Joint application</SelectItem></>
                      ) : (
                        <><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`qf-${item.key}`}
                    className="max-w-xs"
                    type={item.kind === "number" ? "number" : "text"}
                    min={item.kind === "number" ? 0 : undefined}
                    step={item.kind === "number" ? "any" : undefined}
                    placeholder="Unknown"
                    value={val}
                    onChange={(e) => setValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  />
                )}
                <Button size="sm" disabled={busy} onClick={() => void saveOne(item, false)}>Save & re-match</Button>
                {staff && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void saveOne(item, false, true)}>Verify & re-match</Button>}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveOne(item, true)}>I don’t know / Skip</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}