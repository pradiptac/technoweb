"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getSeoRecordScores, type RecordReadiness } from "@/lib/admin";

/**
 * The AEO/GEO panel's one read: a record's two readiness scores.
 *
 * A Server Action rather than a fetch in the page, for the reason the AI
 * panel loads on mount: the panel sits inside a half-filled edit form and
 * carries a Recheck, and a value that can only change on a full re-render
 * of the record is one an editor cannot refresh without losing what they
 * have typed. **No `revalidatePath`** here for the same reason.
 */
export type ReadinessState =
  | { ok: true; data: RecordReadiness }
  | { ok: false; error: string };

export async function loadReadinessAction(type: string, id: number): Promise<ReadinessState> {
  try {
    return { ok: true, data: await getSeoRecordScores(type, id) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { ok: false, error: "Your account cannot read the SEO overview, which is where these scores come from." };
    }

    return { ok: false, error: "We could not load the readiness scores. Try again shortly." };
  }
}
