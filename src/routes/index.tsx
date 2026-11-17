import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Scale, FileLock2, Eye } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loan Scout Matching Tool — Loan Scout LLC" },
      { name: "description", content: "Secure internal platform for Loan Scout LLC advisors and clients: private documents, human-reviewed lender matching and funding readiness." },
      { property: "og:title", content: "Loan Scout Matching Tool" },
      { property: "og:description", content: "Secure, human-reviewed funding recommendations from Loan Scout LLC." },
    ],
  }),
  component: Landing,
});

const pillars = [
  { icon: FileLock2, t: "Private by design", d: "Reports live in encrypted private storage. Every access is permission-checked on the server and logged." },
  { icon: Scale, t: "Cited, not guessed", d: "Lender rules require a source, date and owner approval. Missing data stays Unknown — never zero." },
  { icon: Eye, t: "Human reviewed", d: "Nothing reaches a client until an advisor approves and publishes it." },
  { icon: ShieldCheck, t: "Honest outcomes", d: "Suitability scores are not approval odds. No guarantee of approval or funding." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="surface-grid absolute inset-0 opacity-[0.07]" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Logo inverted />
          <Button asChild variant="secondary"><Link to="/auth">Sign in</Link></Button>
        </header>
        <section className="py-20 md:py-28">
          <div className="label-caps text-sidebar-primary">Owner · Advisor · Client portal</div>
          <h1 className="font-display mt-3 max-w-3xl text-6xl leading-[0.95] md:text-8xl">Funding strategy, verified at every step.</h1>
          <p className="mt-6 max-w-xl text-lg text-sidebar-foreground/75">
            The Loan Scout Matching Tool connects your credit documents, goals and source-backed lender requirements into a reviewed funding plan.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"><Link to="/auth">Sign in with email link</Link></Button>
          </div>
          <p className="mt-4 text-sm text-sidebar-foreground/60">Access is by invitation from Loan Scout LLC.</p>
        </section>
        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.t} className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-5">
              <p.icon className="h-5 w-5 text-sidebar-primary" />
              <div className="label-caps mt-4 text-sidebar-foreground">{p.t}</div>
              <p className="mt-2 text-sm text-sidebar-foreground/70">{p.d}</p>
            </div>
          ))}
        </section>
        <footer className="border-t border-sidebar-border py-6 text-xs text-sidebar-foreground/55">
          © {new Date().getFullYear()} Loan Scout LLC. Recommendations are informational; lenders make all credit decisions. No guarantee of approval, rates or funding.
        </footer>
      </div>
    </div>
  );
}
