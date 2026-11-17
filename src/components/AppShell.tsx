import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { LayoutDashboard, Users, Landmark, ShieldCheck, UserCog, Map, LogOut, Moon, Sun, Menu, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/use-me";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function applyTheme(t: "light" | "dark") {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { if (me) applyTheme(me.theme); }, [me?.theme]);

  const toggleTheme = async () => {
    if (!me) return;
    const next = me.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    await supabase.from("profiles").update({ theme: next }).eq("id", me.id);
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const staff = me?.primary === "owner" || me?.primary === "employee";
  const nav = [
    { to: "/dashboard", label: me?.primary === "client" ? "My Funding" : "Command Center", icon: LayoutDashboard, show: true },
    { to: "/clients", label: "Clients", icon: Users, show: staff },
    { to: "/lenders", label: "Lenders", icon: Landmark, show: staff },
    { to: "/team", label: "Team & Access", icon: UserCog, show: me?.primary === "owner" },
    { to: "/security", label: "Security Center", icon: ShieldCheck, show: me?.primary === "owner" },
    { to: "/account", label: "My account", icon: KeyRound, show: true },
    { to: "/roadmap", label: "Roadmap", icon: Map, show: staff },
  ].filter((n) => n.show);

  const NavList = () => (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => (
        <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-primary font-medium" }}>
          <n.icon className="h-4 w-4" /> {n.label}
        </Link>
      ))}
    </nav>
  );
  const Footer = () => (
    <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4">
      <div className="truncate px-1 text-xs text-sidebar-foreground/70">{me?.email}</div>
      <div className="label-caps px-1 text-[0.6rem] text-sidebar-primary">{me?.primary ?? "no role"}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={toggleTheme} aria-label="Toggle theme">
          {me?.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-64 shrink-0 flex-col gap-6 bg-sidebar p-5 md:flex">
        <Logo inverted />
        <NavList />
        <Footer />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b bg-sidebar p-3 md:hidden">
          <Logo compact inverted />
          <Sheet>
            <SheetTrigger asChild><Button size="icon" variant="ghost" className="text-sidebar-foreground" aria-label="Menu"><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="flex flex-col gap-6 bg-sidebar p-5"><Logo inverted /><NavList /><Footer /></SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="label-caps text-primary">{kicker}</div>}
        <h1 className="font-display text-4xl leading-none md:text-5xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
