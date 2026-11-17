import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/lib/use-me";
import { OwnerCommandCenter, EmployeeCommandCenter } from "@/components/StaffDashboards";
import { ClientDashboard } from "@/components/ClientDashboard";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Loan Scout Matching Tool" }, { name: "description", content: "Your Loan Scout workspace." }, { property: "og:title", content: "Dashboard — Loan Scout" }, { property: "og:description", content: "Your Loan Scout workspace." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return null;
  if (!me.active) return <Pending title="Access suspended" body="Your access has been deactivated by the Loan Scout owner." />;
  if (me.primary === "owner") return <OwnerCommandCenter me={me} />;
  if (me.primary === "employee") return <EmployeeCommandCenter me={me} />;
  if (me.primary === "client" && me.clientId) return <ClientDashboard me={me} />;
  return <Pending title="Account pending" body="Your sign-in worked, but Loan Scout LLC hasn't granted access to this account yet. Access is by invitation. If you were expecting an invitation, contact your Loan Scout advisor." />;
}

function Pending({ title, body }: { title: string; body: string }) {
  return <div><PageHeader title={title} /><Card><CardContent className="p-6 text-sm text-muted-foreground">{body}</CardContent></Card></div>;
}
