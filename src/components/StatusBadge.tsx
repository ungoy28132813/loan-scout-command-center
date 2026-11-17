import { cn } from "@/lib/utils";
const tone: Record<string, string> = {
  pass: "bg-success text-success-foreground", potential_match: "bg-success text-success-foreground", approved: "bg-success text-success-foreground", verified: "bg-success text-success-foreground", published: "bg-success text-success-foreground", active: "bg-success text-success-foreground",
  fail: "bg-destructive text-destructive-foreground", does_not_meet_published: "bg-destructive text-destructive-foreground", denied: "bg-destructive text-destructive-foreground", rejected: "bg-destructive text-destructive-foreground",
  unknown: "bg-unknown text-unknown-foreground", estimate_concern: "bg-warning text-warning-foreground", needs_review: "bg-warning text-warning-foreground", pending: "bg-warning text-warning-foreground", proposed: "bg-warning text-warning-foreground", draft: "bg-muted text-muted-foreground",
};
export function StatusBadge({ value, label }: { value: string; label?: string | undefined }) {
  return <span className={cn("label-caps inline-flex items-center rounded px-2 py-0.5 text-[0.62rem]", tone[value] ?? "bg-secondary text-secondary-foreground")}>{label ?? value.replace(/_/g, " ")}</span>;
}
export function DemoBadge() {
  return <span className="label-caps rounded border border-gold px-1.5 py-0.5 text-[0.6rem] text-foreground">DEMO</span>;
}
export function FutureBadge({ phase }: { phase: string }) {
  return <span className="label-caps rounded border border-dashed border-muted-foreground px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">Coming {phase}</span>;
}
