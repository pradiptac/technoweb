"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  commitSiteImport, discardSiteImport, getSiteImport, saveSiteImportDecisions, startSiteImport,
} from "@/lib/admin";
import type { SiteImport, SiteImportDecisions } from "@/types/api";

export type SiteImportActionResult = { import?: SiteImport; error?: string; fieldErrors?: Record<string, string> };

const PAGE = "/admin/imports/site";

/** The API's own words: the first error per field, and the first overall as the message. */
function refusal(error: unknown, fallback: string): SiteImportActionResult {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only an administrator can import a site." };

    const fieldErrors = Object.fromEntries(
      Object.entries(error.errors ?? {}).map(([field, messages]) => [field, messages[0] ?? ""]),
    );
    const first = Object.values(fieldErrors)[0];

    return { error: first || error.message || fallback, fieldErrors };
  }

  return { error: fallback };
}

/** Start a scan of an address, or of a ZIP the screen has already uploaded. */
export async function startSiteImportAction(payload: Record<string, unknown>): Promise<SiteImportActionResult> {
  try {
    const started = await startSiteImport(payload);
    revalidatePath(PAGE);

    return { import: started };
  } catch (error) {
    return refusal(error, "The scan could not be started.");
  }
}

/**
 * What the screen polls. Null when the request failed — the screen keeps what it had.
 *
 * An import that applied the old site's colours and fonts has changed the
 * settings behind every public page, behind the API's back as far as the
 * website's cache is concerned: the poll that sees it finish purges
 * `settings` — the purge a settings save makes — so the site wears them at
 * once rather than when the revalidate window runs out.
 */
export async function pollSiteImportAction(id: number): Promise<SiteImport | null> {
  try {
    const item = await getSiteImport(id);

    if (item.status === "completed" && item.result?.steps.some((s) => s.key === "brand" && s.update > 0)) {
      updateTag("settings");
    }

    return item;
  } catch {
    return null;
  }
}

export async function saveSiteDecisionsAction(id: number, decisions: SiteImportDecisions): Promise<SiteImportActionResult> {
  try {
    return { import: await saveSiteImportDecisions(id, decisions) };
  } catch (error) {
    return refusal(error, "Those choices could not be saved.");
  }
}

export async function commitSiteImportAction(id: number): Promise<SiteImportActionResult> {
  try {
    return { import: await commitSiteImport(id) };
  } catch (error) {
    return refusal(error, "The import could not be started.");
  }
}

export async function discardSiteImportAction(id: number): Promise<SiteImportActionResult> {
  try {
    const discarded = await discardSiteImport(id);
    revalidatePath(PAGE);

    return { import: discarded };
  } catch (error) {
    return refusal(error, "That import could not be discarded.");
  }
}
