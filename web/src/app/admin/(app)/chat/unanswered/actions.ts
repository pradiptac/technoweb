"use server";

import { revalidatePath } from "next/cache";

import { resolveChatUnanswered } from "@/lib/admin";

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
