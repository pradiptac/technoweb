"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { wordSectionWithAi } from "@/lib/admin";
import { iconMap } from "@/components/icons";
import type { AiSectionMode } from "@/types/api";

export type AiSectionResult = {
  /** The section's `data` with the assistant's wording laid over it. */
  data?: Record<string, unknown>;
  error?: string;
  /** Which control the sentence belongs under. */
  field?: "brief" | "section";
};

const MODES: readonly AiSectionMode[] = ["write", "rewrite", "shorten", "expand"];

/**
 * The assistant on one section of the builder (0.127.0): the section's data
 * as the form holds it goes to the API, which answers the same data with its
 * words rewritten. **Nothing is saved** — the builder puts the answer in its
 * own state, through its history, and the page is saved by its form as ever.
 *
 * The icon keys are read here, on the server, for the reason the page
 * draft's are: `iconMap` is the whole identity set, and a client component
 * importing it for a list of names would ship every glyph (CLAUDE.md,
 * "Bundles").
 *
 * `redirect()` stays outside the `try`: it throws, and a `catch` that tries
 * to recognise the throw swallows it instead.
 */
export async function wordSectionAction(input: {
  mode: string;
  type: string;
  data: Record<string, unknown>;
  brief?: string;
}): Promise<AiSectionResult> {
  const mode = (MODES as readonly string[]).includes(input.mode) ? (input.mode as AiSectionMode) : null;
  const brief = (input.brief ?? "").trim();

  if (!mode || typeof input.type !== "string" || !input.data || typeof input.data !== "object") {
    return { error: "The assistant cannot work on this section." };
  }
  if (mode === "write" && brief.length < 10) {
    return { field: "brief", error: "Say what this section should be about — a sentence is enough." };
  }
  if (brief.length > 600) {
    return { field: "brief", error: `Keep it to 600 characters; this has ${brief.length}.` };
  }

  let signedOut = false;

  try {
    const data = await wordSectionWithAi({ mode, type: input.type, data: input.data, brief: brief || null, icons: Object.keys(iconMap) });
    return { data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) signedOut = true;
      else if (error.status === 403) return { error: "Your account cannot edit pages." };
      else if (error.status === 422) {
        const onBrief = error.errors?.brief?.[0];
        const sentence = onBrief ?? error.errors?.section?.[0] ?? Object.values(error.errors ?? {})[0]?.[0] ?? error.message;
        return { field: onBrief ? "brief" : "section", error: sentence };
      } else if (error.status === 429) return { error: "Too many requests in a short time. Wait a minute and try again." };
      else return { error: "The assistant could not do that. Try again shortly." };
    } else if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { error: "The assistant took too long to answer. Nothing was changed; try again." };
    } else {
      return { error: "The assistant could not do that. Try again shortly." };
    }
  }

  if (signedOut) redirect("/admin/login");
  return { error: "The assistant could not do that. Try again shortly." };
}
