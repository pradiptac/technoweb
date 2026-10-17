"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getSemanticStatus, reindexSemantic, testSemanticModel, type SemanticStatus } from "@/lib/admin";

export type SemanticActionState = { error?: string; ok?: string };

function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can do this.";
    if (error.status === 429) return "Too many tries. Wait a minute.";
    if (error.message) return error.message;
  }

  return fallback;
}

/** The panel's numbers, or null when they cannot be read. */
export async function semanticStatusAction(): Promise<SemanticStatus | null> {
  try {
    return await getSemanticStatus();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    return null;
  }
}

/** One real embedding; OpenRouter's own words on a refusal. */
export async function semanticTestAction(): Promise<SemanticActionState> {
  try {
    const r = await testSemanticModel();

    return r.ok ? { ok: `${r.model} answered with ${r.dimensions} numbers per page.` } : { error: r.message };
  } catch (error) {
    return { error: reason(error, "The model could not be tested.") };
  }
}

export async function semanticReindexAction(): Promise<SemanticActionState> {
  try {
    return { ok: await reindexSemantic() };
  } catch (error) {
    return { error: reason(error, "Indexing could not be started.") };
  }
}
