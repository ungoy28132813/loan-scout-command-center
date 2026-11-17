import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset password — Loan Scout Matching Tool" },
    { name: "description", content: "Set a new Loan Scout account password after secure email recovery." },
    { property: "og:title", content: "Reset password — Loan Scout Matching Tool" },
    { property: "og:description", content: "Secure password recovery for Loan Scout LLC accounts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryLink = hash.get("type") === "recovery";
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setRecovery(true);
        setChecked(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (recoveryLink && data.session) setRecovery(true);
      setChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 12) return void toast.error("Use at least 12 characters.");
    if (pw !== pw2) return void toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Password updated. Your account is ready.");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8"><Logo /></div>
        <Card>
          <CardHeader><CardTitle className="label-caps">Set a new password</CardTitle></CardHeader>
          <CardContent>
            {!checked ? <p className="text-sm text-muted-foreground">Checking your recovery link…</p> : !recovery ? (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">This recovery link is invalid, expired, or has already been used. Request a new link from the sign-in page.</p>
                <Button asChild variant="outline"><Link to="/auth">Back to sign in</Link></Button>
              </div>
            ) : (
              <form onSubmit={save} className="space-y-4">
                <div className="space-y-2"><Label htmlFor="new-pw">New password</Label><Input id="new-pw" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="confirm-new-pw">Confirm new password</Label><Input id="confirm-new-pw" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
                <p className="text-xs text-muted-foreground">At least 12 characters. Passwords found in known data leaks are rejected.</p>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
