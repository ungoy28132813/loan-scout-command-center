import { useState } from "react";
import { Download, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { deliverFile } from "@/lib/download";
import { strategyFilename, type StrategyExportPayload } from "@/lib/strategy-pdf";

type StrategyPdfDownloadProps = { snapshotId: string; version: number };

export function StrategyPdfDownload(props: StrategyPdfDownloadProps) {
  // Never carry a prepared PDF or an in-flight request into a different snapshot.
  return <SnapshotPdfDownload key={JSON.stringify([props.snapshotId, props.version])} {...props} />;
}

function SnapshotPdfDownload({ snapshotId, version }: StrategyPdfDownloadProps) {
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ blob: Blob; filename: string } | null>(null);

  const prepare = async () => {
    setBusy(true);
    setPrepared(null);
    try {
      const { data, error } = await supabase.rpc("prepare_strategy_export", { _snapshot_id: snapshotId });
      if (error) throw error;
      const payload = data as unknown as StrategyExportPayload;
      if (!payload || payload.snapshot_id !== snapshotId || payload.version !== version) {
        throw new Error("The exported strategy does not match the selected version. Refresh and try again.");
      }
      const { generateStrategyPdf } = await import("@/lib/strategy-pdf");
      const blob = await generateStrategyPdf(payload);
      setPrepared({ blob, filename: strategyFilename(payload.client_name, payload.version) });
      toast.success("PDF is ready. Select Download PDF to save it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the PDF");
    } finally { setBusy(false); }
  };

  if (prepared) {
    return <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void deliverFile(prepared.blob, prepared.filename)}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
      <Button size="sm" variant="ghost" onClick={prepare} disabled={busy} aria-label="Refresh PDF"><RefreshCw className="h-4 w-4" /></Button>
    </div>;
  }
  return <Button size="sm" variant="outline" onClick={prepare} disabled={busy}><FileDown className="mr-1 h-4 w-4" />{busy ? "Preparing…" : `Prepare PDF v${version}`}</Button>;
}
