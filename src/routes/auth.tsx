import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Sign in — Loan Scout Matching Tool" },
    { name: "description", content: "Email-link or password sign-in for Loan Scout LLC team members and clients." },
    { property: "og:title", content: "Sign in — Loan Scout Matching Tool" },
    { property: "og:description", content: "Email-link or password sign-in for Loan Scout LLC." },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [usePw, setUsePw] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/dashboard", replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (s?.user) navigate({ to: "/dashboard", replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (usePw) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      setBusy(false);
      if (error) return void toast.error("Email or password is incorrect.");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth`, shouldCreateUser: true } });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setSent(true);
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
        <Logo inverted />
        <div>
          <h2 className="font-display text-6xl leading-none">Secure access.<br /><span className="text-sidebar-primary">No passwords.</span></h2>
          <p className="mt-4 max-w-sm text-sidebar-foreground/70">We email you a one-time sign-in link. Sessions can be ended at any time by signing out; owner deactivation removes all data access immediately.</p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">Loan Scout LLC</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden"><Logo /></div>
          <h1 className="font-display text-4xl">Sign in</h1>
          {sent ? (
            <div className="mt-6 rounded-lg border bg-card p-5">
              <Mail className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">Check your email</p>
              <p className="mt-1 text-sm text-muted-foreground">If {email} is eligible, a sign-in link is on its way. Open it on this device.</p>
              <Button variant="link" className="px-0" onClick={() => setSent(false)}>Use a different email</Button>
            </div>
          ) : (
            <form onSubmit={send} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {usePw && (
                <div className="space-y-2">
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                </div>
              )}
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(Boolean(v))} className="mt-0.5" />
                <span>I have read the privacy notice below. Access is monitored and logged for security.</span>
              </label>
              <Button type="submit" className="w-full" disabled={!agree || busy}>{busy ? "Please wait…" : usePw ? "Sign in" : "Email me a sign-in link"}</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setUsePw((v) => !v)}>{usePw ? "Email me a link instead" : "Sign in with a password"}</Button>
              <Button type="button" variant="outline" className="w-full" disabled title="Passkeys are not available yet">
                <KeyRound className="mr-2 h-4 w-4" /> Passkey — not yet available
              </Button>
            </form>
          )}
          <details className="mt-8 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Privacy notice</summary>
            <p className="mt-2">Loan Scout LLC stores the documents and information you provide in private, encrypted storage to evaluate funding options for you. Only you and Loan Scout staff assigned to your file can access it, and each access is recorded. We do not pull your credit, submit applications or contact lenders on your behalf through this tool. Documents are retained until deleted by the Loan Scout owner, subject to applicable law.</p>
          </details>
        </div>
      </div>
    </div>
  );
}
