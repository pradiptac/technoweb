import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { SemanticStatus } from "@/types/semantic-search";

export type { SemanticStatus };

export async function getSemanticStatus(): Promise<SemanticStatus> {
  return (await apiFetch<{ data: SemanticStatus }>("/admin/search/semantic", { token: await token() })).data;
}

/** One real embedding through the saved key. A refusal is OpenRouter's own words, returned rather than thrown. */
export async function testSemanticModel(): Promise<{ ok: true; model: string; dimensions: number } | { ok: false; message: string }> {
  try {
    const res = await apiFetch<{ data: { model: string; dimensions: number } }>("/admin/search/semantic/test", { method: "POST", token: await token() });

    return { ok: true, ...res.data };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { ok: false, message: error.message };
    throw error;
  }
}

export async function reindexSemantic(): Promise<string> {
  return (await apiFetch<{ message: string }>("/admin/search/semantic/reindex", { method: "POST", token: await token() })).message;
}
