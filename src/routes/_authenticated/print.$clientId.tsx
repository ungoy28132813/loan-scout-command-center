import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { PublishedStrategy, type SnapshotContent } from "@/components/client/PublishedStrategy";
import { fmtDate } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/print/$clientId")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Funding strategy export — Loan Scout" }, { name: "description", content: "Printable approved strategy." }, { property: "og:title", content: "Strategy export — Loan Scout" }, { property: "og:description", content: "Printable approved strategy." }, { name: "robots", content: "noindex" }] }),
  component: PrintView,
});

function PrintView() {
  const { clientId } = Route.useParams();
  const q = useQuery({ queryKey: ["print", clientId], queryFn: async () => {
    const [c, s] = await Promise.all([supabase.from("clients").select("display_name").eq("id", clientId).maybeSingle(), supabase.from("published_snapshots").select("*").eq("client_id", clientId).eq("status", "published").order("published_at", { ascending: false }).limit(1)]);
    return { name: c.data?.display_name, snap: s.data?.[0] };
  } });
  useEffect(() => { if (q.data?.snap) supabase.rpc("log_event", { _action: "export_pdf", _entity: "published_snapshots", _entity_id: q.data.snap.id, _client_id: clientId, _meta: {} }); }, [q.data?.snap?.id]);
  if (!q.data) return null;
  if (!q.data.snap) return <p>No published strategy to export.</p>;
  return <div className="mx-auto max-w-3xl">
    <div className="no-print mb-4 flex justify-end"><Button onClick={() => window.print()}>Print / Save as PDF</Button></div>
    <div className="mb-6 flex items-center justify-between border-b pb-4"><Logo /><div className="text-right text-sm"><div className="font-medium">{q.data.name}</div><div className="text-muted-foreground">Approved strategy v{q.data.snap.version} · {fmtDate(q.data.snap.published_at)}</div></div></div>
    <PublishedStrategy content={q.data.snap.content as unknown as SnapshotContent} />
  </div>;
}
