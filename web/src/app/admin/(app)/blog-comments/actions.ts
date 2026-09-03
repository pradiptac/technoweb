"use server";

import { revalidatePath, updateTag } from "next/cache";
import { moderateComments, deleteComment } from "@/lib/admin";

export type ModerateState = { error?: string; ok?: string };

/**
 * Move one comment or a selection of them.
 *
 * The ids arrive as repeated `ids` fields from the checkbox column, which is
 * how a bulk action and a single-row action end up being the same submission —
 * and the same code path, so they cannot come to mean different things.
 */
export async function moderateAction(
  _previous: ModerateState,
  formData: FormData,
): Promise<ModerateState> {
  const ids = formData.getAll("ids").map(Number).filter(Boolean);
  const status = String(formData.get("status") ?? "");

  if (ids.length === 0) return { error: "Nothing was selected." };
  if (!status) return { error: "Choose what to do with them." };

  try {
    await moderateComments(ids, status);
  } catch {
    return { error: "We could not move those comments." };
  }

  revalidatePath("/admin/blog-comments");

  /*
   * And the public page, which is the half that was missed first.
   *
   * `publicApi.postComments` caches for 60s, so approving a comment in the
   * console left it invisible on the article for up to a minute — a moderator
   * pressing Publish and then checking the page would conclude it had not
   * worked. The console's own writes clear their own cache; that is the rule
   * `updateTag("settings")` already follows for a setting saved here.
   *
   * The `blog` tag rather than `blog-comments:<slug>`: this action moves a
   * selection that may span several posts, and the ids alone do not say which.
   * Broader than strictly needed and correct, which is the right way round —
   * the alternative is a fetch per comment to learn slugs the API already knows.
   */
  updateTag("blog");

  const word = status === "approved" ? "published" : status === "spam" ? "marked as spam" : "moved";

  return { ok: `${ids.length} comment${ids.length === 1 ? "" : "s"} ${word}.` };
}

/**
 * Delete for good.
 *
 * Separate from marking something spam, which is reversible. This exists
 * because spam is genuinely worth removing rather than keeping for ever, and
 * because a comment can contain something that must not sit in a database at
 * all — a request nobody should have to answer with a database client.
 */
export async function deleteCommentAction(
  _previous: ModerateState,
  formData: FormData,
): Promise<ModerateState> {
  const id = Number(formData.get("id"));

  if (!id) return { error: "That comment could not be found." };

  try {
    await deleteComment(id);
  } catch {
    return { error: "We could not delete that comment." };
  }

  revalidatePath("/admin/blog-comments");
  updateTag("blog");

  return { ok: "Deleted." };
}
