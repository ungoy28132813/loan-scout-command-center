import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [
    { title: "My account — Loan Scout Matching Tool" },
    { name: "description", content: "Manage your own password and supported passkeys." },
    { property: "og:title", content: "My account — Loan Scout Matching Tool" },
    { property: "og:description", content: "Manage your own Loan Scout sign-in methods." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Account,
});

function Account() {
  const qc = useQueryClient();
  const [currentPw, setCurrentPw] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeys = useQuery({
    queryKey: ["own-passkeys"],
    queryFn: async () => {
      if (!window.PublicKeyCredential) return { available: false, reason: "This browser does not support WebAuthn.", items: [] };
      const { data, error } = await supabase.auth.passkey.list();
      if (error) return { available: false, reason: error.code === "passkey_disabled" ? "Passkeys are disabled by the live authentication service." : error.message, items: [] };
      return { available: true, reason: "", items: data ?? [] };
    },
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 12) return void toast.error("Use at least 12 characters.");
    if (pw !== pw2) return void toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: currentPw });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setCurrentPw(""); setPw(""); setPw2("");
    toast.success("Password saved. You can now sign in with email + password.");
  };

  const addPasskey = async () => {
    setPasskeyBusy(true);
    const { error } = await supabase.auth.registerPasskey();
    setPasskeyBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Passkey registered");
    qc.invalidateQueries({ queryKey: ["own-passkeys"] });
  };

  const removePasskey = async (passkeyId: string) => {
    setPasskeyBusy(true);
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    setPasskeyBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Passkey removed");
    qc.invalidateQueries({ queryKey: ["own-passkeys"] });
  };

  return (
    <div>
      <PageHeader title="My account" />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="label-caps">Change password</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="current-pw">Current password</Label><Input id="current-pw" type="password" required autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="pw">New password</Label><Input id="pw" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="pw2">Confirm new password</Label><Input id="pw2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">At least 12 characters. Your current password is required. Passwords found in known data leaks are rejected.</p>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
            </form>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="label-caps">Passkeys</CardTitle><p className="text-sm text-muted-foreground">Real device or platform passkeys use your browser's WebAuthn ceremony and server verification. No passkey is created by this page itself.</p></CardHeader>
          <CardContent className="space-y-4">
            {!passkeys.data ? <p className="text-sm text-muted-foreground">Checking support…</p> : !passkeys.data.available ? <p className="text-sm text-muted-foreground">{passkeys.data.reason}</p> : <>
              {passkeys.data.items.length === 0 ? <p className="text-sm text-muted-foreground">No passkeys registered.</p> : <ul className="divide-y text-sm">{passkeys.data.items.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3"><span><KeyRound className="mr-2 inline h-4 w-4 text-primary" />{p.friendly_name ?? "Passkey"}<span className="block text-xs text-muted-foreground">Added {new Date(p.created_at).toLocaleDateString()}{p.last_used_at ? ` · last used ${new Date(p.last_used_at).toLocaleDateString()}` : ""}</span></span><Button size="sm" variant="ghost" aria-label="Remove passkey" disabled={passkeyBusy} onClick={() => removePasskey(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></li>)}</ul>}
              <Button variant="outline" disabled={passkeyBusy} onClick={addPasskey}><KeyRound className="mr-2 h-4 w-4" />{passkeyBusy ? "Waiting for your device…" : "Add a passkey"}</Button>
            </>}
          </CardContent></Card>
      </div>
    </div>
  );
}
