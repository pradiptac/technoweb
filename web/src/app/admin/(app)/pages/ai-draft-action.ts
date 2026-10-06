"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { draftPageWithAi } from "@/lib/admin";
import { iconMap } from "@/components/icons";
import type { AiDraftLength } from "@/types/api";

export type AiDraftState = { error?: string; fieldErrors?: Record<string, string[]> };

const LENGTHS: readonly AiDraftLength[] = ["short", "standard", "long"];

/** The API's own bounds on the brief (`POST /admin/pages/ai-draft`), checked here first so a slip costs no round trip. */
const BRIEF_MIN = 10;
const BRIEF_MAX = 1500;

/**
 * "Draft with AI" (0.116.0): the assistant lays out a draft builder page
 * from a brief, the API saves it unpublished, and the editor lands on its
 * Builder tab to check every `[CHECK: …]` before anything goes live.
 *
 * The icon keys are read here, on the server: `iconMap` is the whole identity
 * set, and importing it into the dialog would ship every glyph to the console
 * for a list of names (CLAUDE.md, "Bundles"). The keys are what the assistant
 * may put on a feature or a card — a key it invents would be a blank tile.
 *
 * `redirect()` stays outside the `try`: it throws, and a `catch` that tries
 * to recognise the throw swallows it instead.
 */
export async function draftPageWithAiAction(_prev: AiDraftState, formData: FormData): Promise<AiDraftState> {
  const brief = String(formData.get("brief") ?? "").trim();
  const lengthRaw = String(formData.get("length") ?? "standard");
  const length: AiDraftLength = (LENGTHS as readonly string[]).includes(lengthRaw) ? (lengthRaw as AiDraftLength) : "standard";
  // The switch posts `1`/`0` through its hidden input; anything else is the default, on.
  const pictures = formData.get("pictures") !== "0";

  if (brief.length < BRIEF_MIN) {
    return { fieldErrors: { brief: [`Say a little more about the page — at least ${BRIEF_MIN} characters.`] } };
  }
  if (brief.length > BRIEF_MAX) {
    return { fieldErrors: { brief: [`Keep the brief to ${BRIEF_MAX} characters; this one has ${brief.length}.`] } };
  }

  let target: string;
  let dropped = 0;

  try {
    const draft = await draftPageWithAi({ brief, length, pictures, icons: Object.keys(iconMap) });
    dropped = Array.isArray(draft.dropped) ? draft.dropped.length : 0;
    // Only a console page path is followed; anything else falls back to the
    // record's own edit screen, which is where `admin_path` points anyway.
    target = typeof draft.admin_path === "string" && /^\/admin\/pages\/\d+(\?[^#]*)?$/.test(draft.admin_path)
      ? draft.admin_path
      : `/admin/pages/${draft.id}`;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot create pages." };
      if (error.status === 422) {
        const sentence = error.errors?.brief?.[0] ?? Object.values(error.errors ?? {})[0]?.[0] ?? error.message;
        return { fieldErrors: { brief: [sentence] } };
      }
      if (error.status === 429) return { error: "Too many drafts in a short time. Wait a minute and try again." };
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { error: "The assistant took too long to answer, and nothing was saved. Try again, perhaps with a shorter page." };
    }
    return { error: "We could not draft the page. Try again shortly." };
  }

  updateTag("pages");
  revalidatePath("/admin/pages");

  const params = new URLSearchParams({ done: "page-drafted" });
  if (dropped > 0) params.set("dropped", String(dropped));
  // A builder draft opens on its sections, unless the API already named a tab.
  if (!target.includes("tab=")) params.set("tab", "builder");
  redirect(`${target}${target.includes("?") ? "&" : "?"}${params.toString()}`);
}
