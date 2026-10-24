"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { approveSocialPost, discardSocialPost, draftSocialPosts } from "@/lib/admin";

export type ApproveResult = {
  /** The API's own sentence — a refusal, or what happened to a send it could not confirm. */
  error?: string;
  /** The status the post settled on, so the panel can say what happened. */
  status?: string;
  /** Where the person finishes the share themselves (X always; LinkedIn when not connected). */
  openUrl?: string | null;
  /** The `?done=` key the toast bridge turns into a message. */
  done?: "social-sent" | "social-shared";
};

/** The API's sentence for the field it names, else its message, else the fallback. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Your account cannot approve social posts.";

    const first = Object.values(error.errors ?? {})[0]?.[0];

    return first || error.message || fallback;
  }

  return fallback;
}

/**
 * Edit and approve are one request: what is sent is exactly what was on
 * screen. A refusal comes back as a sentence; the screen refreshes itself
 * (`router.refresh()`), so the panel redraws the post as the API now holds it.
 * No `revalidatePath` here: the console renders on every request, and a
 * revalidation in the action re-rendered the whole page a second time.
 */
export async function approveSocialPostAction(id: number, text: string, confirm: boolean): Promise<ApproveResult> {
  try {
    const { post, open_url } = await approveSocialPost(id, text, confirm);

    return {
      status: post.status,
      openUrl: open_url,
      error: post.status === "unconfirmed" ? (post.error ?? undefined) : undefined,
      done: post.status === "sent" ? "social-sent" : post.status === "shared_manually" ? "social-shared" : undefined,
    };
  } catch (error) {
    return { error: reason(error, "We could not send that post. Nothing was posted.") };
  }
}

/** Discarding changes nothing public; the panel closes itself and announces it through `?done=`. */
export async function discardSocialPostAction(id: number): Promise<{ ok?: true; error?: string }> {
  try {
    await discardSocialPost(id);
  } catch (error) {
    return { error: reason(error, "We could not discard that post.") };
  }

  return { ok: true };
}

export type DraftState = { error?: string };

/**
 * "Draft a social post" on a record's edit screen: a pair for the record, then
 * the review list. `redirect()` is outside the `try` — it works by throwing.
 */
export async function draftSocialAction(_: DraftState, formData: FormData): Promise<DraftState> {
  const type = String(formData.get("type") ?? "");
  const id = Number(formData.get("id"));

  try {
    await draftSocialPosts(type, id);
  } catch (error) {
    return { error: reason(error, "We could not make the drafts. Try again in a moment.") };
  }

  redirect("/admin/social-posts?done=social-drafted");
}
