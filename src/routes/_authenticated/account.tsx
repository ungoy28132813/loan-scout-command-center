import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [
    { title: "My account — Loan Scout Matching Tool" },
    { name: "description", content: "Manage your own sign-in password." },
    { property: "og:title", content: "My account — Loan Scout" },
    { property: "og:description", content: "Manage your own sign-in password." },
  ] }),
  component: Account,
});

function Account() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 12) return void toast.error("Use at least 12 characters.");
    if (pw !== pw2) return void toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setPw(""); setPw2("");
    toast.success("Password saved. You can now sign in with email + password.");
  };
  return (
    <div>
      <PageHeader title="My account" />
      <Card className="max-w-md"><CardHeader><CardTitle className="label-caps">Set a password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="pw">New password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="pw2">Confirm password</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">At least 12 characters. Passwords found in known data leaks are rejected.</p>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        </CardContent></Card>
    </div>
  );
}
