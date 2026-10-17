"use server";

import { revalidatePath } from "next/cache";
import { recheckHealth, setHealthIgnored } from "@/lib/admin";
import { runBulkAction } from "@/lib/admin/bulk";
import type { BulkState } from "@/types/bulk";

export type RowState = { error?: string; ok?: string };

/** Ignore one finding, or stop ignoring it — the form says which. */
export async function ignoreFindingAction(_prev: RowState, formData: FormData): Promise<RowState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "That problem could not be found." };
  try {
    await setHealthIgnored(id, formData.get("ignored") === "1");
  } catch {
    return { error: "We could not update that problem." };
  }
  revalidatePath("/admin/health");
  return {};
}

/** Check one record again now, after fixing it in another tab. */
export async function recheckAction(_prev: RowState, formData: FormData): Promise<RowState> {
  const type = String(formData.get("type") ?? "");
  const id = Number(formData.get("id"));
  if (!type || !id) return { error: "That record could not be found." };
  try {
    const rows = await recheckHealth(type, id);
    revalidatePath("/admin/health");
    return { ok: rows.length === 0 ? "Checked again — nothing to fix." : `Checked again — ${rows.length} still to fix.` };
  } catch {
    return { error: "We could not check that record again." };
  }
}

/** The ticked rows: ignore, or stop ignoring. Nothing public caches a finding, so no tags. */
export async function bulkHealthAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  return runBulkAction(formData, { path: "health", noun: ["problem", "problems"], tags: [], paths: ["/admin/health"] });
}
