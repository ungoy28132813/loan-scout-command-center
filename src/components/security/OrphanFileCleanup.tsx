import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteOrphanedFiles, listOrphanedFiles } from "@/lib/orphan-files.functions";
import type { OrphanedFile } from "@/lib/orphan-files";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function sizeLabel(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function OrphanFileCleanup() {
  const list = useServerFn(listOrphanedFiles);
  const remove = useServerFn(deleteOrphanedFiles);
  const [files, setFiles] = useState<OrphanedFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    try {
      const result = await list();
      setFiles(result.files);
      setSelected([]);
      setScanned(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Private storage inventory failed");
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async () => {
    setBusy(true);
    try {
      const result = await remove({ data: { paths: selected } });
      if (result.auditRecorded) toast.success(`${result.deleted} unregistered test file(s) permanently deleted`);
      else toast.warning("Files deleted, but the audit entry could not be recorded");
      const refreshed = await list();
      setFiles(refreshed.files);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="label-caps">Unregistered private files</CardTitle>
        <p className="text-sm text-muted-foreground">Find storage objects with no document record, such as interrupted synthetic tests. No file contents or download links are exposed. Registered client documents are not listed.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={scan} disabled={busy}>{busy ? "Working…" : scanned ? "Scan again" : "Scan private storage"}</Button>
        {scanned && files.length === 0 && <p className="text-sm text-muted-foreground">No unregistered files found.</p>}
        {files.length > 0 && <>
          <p className="text-xs text-muted-foreground">Only delete objects you recognize as test leftovers. A 15-minute waiting period protects recent uploads. Deletion is permanent and audited.</p>
          <ul className="divide-y rounded border text-sm">
            {files.map((file) => <li key={file.path} className="flex flex-wrap items-center gap-3 p-3">
              <input
                type="checkbox"
                aria-label={`Select ${file.fileName}`}
                disabled={!file.eligibleForCleanup || busy}
                checked={selected.includes(file.path)}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, file.path] : current.filter((path) => path !== file.path))}
              />
              <span className="min-w-0 flex-1"><span className="block truncate font-mono text-xs">{file.fileName}</span><span className="text-xs text-muted-foreground">{file.createdAt ? new Date(file.createdAt).toLocaleString() : "Unknown date"} · {sizeLabel(file.sizeBytes)} · {file.mimeType}</span></span>
              {!file.eligibleForCleanup && <span className="text-xs text-muted-foreground">Waiting period</span>}
            </li>)}
          </ul>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" size="sm" disabled={!selected.length || busy}><Trash2 className="mr-2 h-4 w-4" />Delete {selected.length || ""} selected</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Permanently delete unregistered test files?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. Only continue if the selected objects are test leftovers, not client records. No registered document is included.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={cleanup}>Delete permanently</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>}
      </CardContent>
    </Card>
  );
}
