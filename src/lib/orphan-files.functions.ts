import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isCleanupEligible, isSafeOrphanPath, type OrphanedFile } from "@/lib/orphan-files";

const BUCKET = "client-documents";
const PAGE_SIZE = 1000;

type AdminClient = SupabaseClient<Database>;

async function requireOwner(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_owner", { _uid: context.userId });
  if (error || data !== true) throw new Error("Owner access required");
}

async function listEntries(admin: AdminClient, prefix: string) {
  const entries = [];
  for (let offset = 0; offset < 10_000; offset += PAGE_SIZE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw new Error("Private storage inventory is unavailable");
    entries.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return entries;
}

async function scanOrphans(admin: AdminClient): Promise<OrphanedFile[]> {
  const root = await listEntries(admin, "");
  const objects: { path: string; createdAt: string | null; sizeBytes: number; mimeType: string }[] = [];

  for (const entry of root) {
    const children = entry.id === null ? await listEntries(admin, entry.name) : [entry];
    for (const child of children) {
      const path = entry.id === null ? `${entry.name}/${child.name}` : child.name;
      if (!isSafeOrphanPath(path)) continue;
      objects.push({
        path,
        createdAt: child.created_at ?? child.updated_at ?? null,
        sizeBytes: Number(child.metadata?.size ?? 0),
        mimeType: typeof child.metadata?.mimetype === "string" ? child.metadata.mimetype : "unknown",
      });
    }
  }

  const registered = new Set<string>();
  for (let i = 0; i < objects.length; i += 200) {
    const paths = objects.slice(i, i + 200).map((object) => object.path);
    const { data, error } = await admin.from("documents").select("storage_path").in("storage_path", paths);
    if (error) throw new Error("Document records could not be checked");
    for (const row of data ?? []) registered.add(row.storage_path);
  }

  return objects
    .filter((object) => !registered.has(object.path))
    .map((object) => ({
      ...object,
      fileName: object.path.split("/").pop() ?? object.path,
      eligibleForCleanup: isCleanupEligible(object.createdAt),
    }))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export const listOrphanedFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return { files: await scanOrphans(supabaseAdmin) };
  });

export const deleteOrphanedFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ paths: z.array(z.string().refine(isSafeOrphanPath)).min(1).max(20) }))
  .handler(async ({ data, context }) => {
    await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orphans = await scanOrphans(supabaseAdmin);
    const eligible = new Set(orphans.filter((file) => file.eligibleForCleanup).map((file) => file.path));
    if (!data.paths.every((path) => eligible.has(path))) {
      throw new Error("Only selected unregistered files past the waiting period can be deleted");
    }

    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(data.paths);
    if (error) throw new Error("The selected unregistered files could not be deleted");

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert(
      data.paths.map((path) => ({
        actor_id: context.userId,
        action: "delete",
        entity: "orphan_storage_object",
        entity_id: path,
        metadata: { changed_fields: [] },
      })),
    );
    return { deleted: data.paths.length, auditRecorded: !auditError };
  });
