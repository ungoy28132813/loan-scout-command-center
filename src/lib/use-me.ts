import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PermKey = "can_upload_docs" | "can_edit_extractions" | "can_run_matching" | "can_approve_publish" | "can_update_applications" | "can_manage_readiness" | "can_post_announcements" | "can_export_pdf" | "can_propose_rules";
export type Role = "owner" | "employee" | "client";
export interface Me {
  id: string; email: string; fullName: string | null; theme: "light" | "dark"; active: boolean;
  roles: Role[]; primary: Role | null; perms: Record<PermKey, boolean>; clientId: string | null;
}

export async function fetchMe(): Promise<Me | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: roles }, { data: perms }, { data: client }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("employee_permissions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  const r = (roles ?? []).map((x) => x.role as Role);
  const primary: Role | null = r.includes("owner") ? "owner" : r.includes("employee") ? "employee" : r.includes("client") ? "client" : null;
  const isOwner = primary === "owner";
  const p: Record<string, boolean> = {};
  if (perms) for (const [k, v] of Object.entries(perms)) if (k.startsWith("can_")) p[k] = Boolean(v);
  return {
    id: user.id, email: user.email ?? "", fullName: profile?.full_name ?? null,
    theme: (profile?.theme as "light" | "dark") ?? "light", active: profile?.active ?? false,
    roles: r, primary, clientId: client?.id ?? null,
    perms: new Proxy(p, { get: (t, k: string) => isOwner || Boolean(t[k]) }) as Record<PermKey, boolean>,
  };
}

export const meQuery = { queryKey: ["me"], queryFn: fetchMe, staleTime: 30_000 };
export const useMe = () => useQuery(meQuery);
export const isStaff = (m: Me | null | undefined) => m?.primary === "owner" || m?.primary === "employee";
