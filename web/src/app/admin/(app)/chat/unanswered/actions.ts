"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api";
import { briefChatUnanswered, resolveChatUnanswered } from "@/lib/admin";

/**
 * "Somebody has written that page."
 *
 * The whole group at once — a question asked forty times is one piece of work,
 * and forty presses is a queue nobody empties.
 */
export async function resolveUnansweredAction(ids: number[]): Promise<{ error?: string }> {
  try {
    await resolveChatUnanswered(ids);
  } catch {
    return { error: "That did not save. Try again shortly." };
  }

  revalidatePath("/admin/chat/unanswered");
  revalidatePath("/admin/chat");

  return {};
}

export type BriefState = { ok: true; id: number; title: string; adminPath: string } | { ok: false; error: string };

/**
 * "Write me a page for this."
 *
 * The assistant drafts a knowledge-base article from the group's questions
 * — a draft with `[CHECK: …]` where the facts go, never published — and the
 * group is marked handled with the draft's id. The refusal sentence is the
 * API's own: switched off, no key, the day's cap.
 */
export async function briefUnansweredAction(ids: number[]): Promise<BriefState> {
  try {
    const draft = await briefChatUnanswered(ids);
    revalidatePath("/admin/chat/unanswered");
    revalidatePath("/admin/chat");
    return { ok: true, id: draft.id, title: draft.title, adminPath: draft.admin_path };
  } catch (error) {
    if (error instanceof ApiError) {
      const first = Object.values(error.errors ?? {}).flat()[0];
      return { ok: false, error: typeof first === "string" ? first : error.message };
    }
    return { ok: false, error: "The assistant could not be reached." };
  }
}
