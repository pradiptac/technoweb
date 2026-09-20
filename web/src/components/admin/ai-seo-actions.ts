"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  decideSeoSuggestion,
  getSeoAiContext,
  getSeoSuggestions,
  runSeoAi,
  testSeoAiModel,
} from "@/lib/admin";
import type { SeoAiActionKey, SeoAiMeta, SeoSuggestion } from "@/types/api";

/**
 * The AI assistant's actions.
 *
 * Discriminated unions rather than a form state, and **no `revalidatePath`** —
 * both for the reason `recheckAction` gives. These are called from a panel
 * inside a half-filled edit form: revalidating would re-render the record
 * server-side and throw away everything the editor has typed, which is a far
 * worse outcome than a stale figure. Nothing here changes the record anyway.
 */
export type AiState<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * The refusals worth telling an editor apart.
 *
 * A 422 from these endpoints is always actionable — switched off, no key, cap
 * reached, the service silent — and its message is written for a person, so it
 * is passed through verbatim. Everything else gets one sentence, because
 * everything else is our problem rather than theirs.
 */
function toState<T>(error: unknown): AiState<T> {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { ok: false, error: "Your account cannot use the SEO assistant." };
    if (error.status === 404) return { ok: false, error: "That record no longer exists." };
    if (error.status === 429) {
      return { ok: false, error: "That was a lot of requests at once. Wait a moment and try again." };
    }
    if (error.status === 422) {
      return { ok: false, error: error.message || "The assistant could not answer." };
    }
  }

  return { ok: false, error: "We could not reach the assistant. Try again shortly." };
}

export async function runSeoAiAction(
  action: SeoAiActionKey,
  type: string,
  id: number,
): Promise<AiState<SeoSuggestion>> {
  try {
    return { ok: true, data: await runSeoAi(action, type, id) };
  } catch (error) {
    return toState(error);
  }
}

export async function decideSeoSuggestionAction(
  id: number,
  status: "applied" | "rejected",
): Promise<AiState<SeoSuggestion>> {
  try {
    return { ok: true, data: await decideSeoSuggestion(id, status) };
  } catch (error) {
    return toState(error);
  }
}

export async function loadSeoAiAction(
  type: string,
  id: number,
): Promise<AiState<{ suggestions: SeoSuggestion[]; meta: SeoAiMeta }>> {
  try {
    const res = await getSeoSuggestions(type, id);

    return { ok: true, data: { suggestions: res.data, meta: res.meta } };
  } catch (error) {
    return toState(error);
  }
}

export async function seoAiContextAction(
  type: string,
  id: number,
  action?: SeoAiActionKey,
): Promise<AiState<{ context: string; characters: number; approximate_tokens: number }>> {
  try {
    return { ok: true, data: await getSeoAiContext(type, id, action) };
  } catch (error) {
    return toState(error);
  }
}

/**
 * The one action that reports the provider's own words.
 *
 * "The model `gpt-5-turbo` does not exist" is what tells somebody what to fix;
 * "could not connect" tells them nothing. Safe here in a way it is not on a
 * visitor-facing path: the caller is an authenticated SEO manager and the only
 * thing they influence is the model name.
 */
export async function testSeoAiModelAction(model?: string): Promise<AiState<{ model: string }>> {
  try {
    const data = await testSeoAiModel(model);

    return { ok: true, data: { model: data.model } };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { ok: false, error: error.message || "That model did not answer." };
    }

    return toState(error);
  }
}
