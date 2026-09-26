"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  commitWordPressImport, discardWordPressImport, getWordPressImport, saveWordPressDecisions, startWordPressImport,
} from "@/lib/admin";
import type { WordPressImport, WordPressImportDecisions } from "@/types/api";

export type ImportActionResult = { import?: WordPressImport; error?: string; fieldErrors?: Record<string, string> };

const PAGE = "/admin/imports/wordpress";

/** The API's own words: the first error per field, and the first overall as the message. */
function refusal(error: unknown, fallback: string): ImportActionResult {
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

export async function startImportAction(payload: Record<string, unknown>): Promise<ImportActionResult> {
  try {
    const started = await startWordPressImport(payload);
    revalidatePath(PAGE);

    return { import: started };
  } catch (error) {
    return refusal(error, "The scan could not be started.");
  }
}

/** What the screen polls. Null when the request failed — the screen keeps what it had. */
export async function pollImportAction(id: number): Promise<WordPressImport | null> {
  try {
    return await getWordPressImport(id);
  } catch {
    return null;
  }
}

export async function saveDecisionsAction(id: number, decisions: WordPressImportDecisions): Promise<ImportActionResult> {
  try {
    return { import: await saveWordPressDecisions(id, decisions) };
  } catch (error) {
    return refusal(error, "Those choices could not be saved.");
  }
}

export async function commitImportAction(id: number): Promise<ImportActionResult> {
  try {
    return { import: await commitWordPressImport(id) };
  } catch (error) {
    return refusal(error, "The import could not be started.");
  }
}

export async function discardImportAction(id: number): Promise<ImportActionResult> {
  try {
    const discarded = await discardWordPressImport(id);
    revalidatePath(PAGE);

    return { import: discarded };
  } catch (error) {
    return refusal(error, "That import could not be discarded.");
  }
}
