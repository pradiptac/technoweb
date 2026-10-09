"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  autoTagStoreProducts, createStoreTag, deleteStoreTag, mergeStoreTag, reorderStoreTags,
  saveStoreTagSettings, suggestStoreTags, updateStoreTag, type TagSuggestInput,
} from "@/lib/admin";

/**
 * Store → Tags and the product form's Suggest button (0.141.0).
 *
 * Every action that changes a tag, or the three switches, purges the
 * `store-tags` and `store-products` fetch tags: the shop front's row is an
 * ISR-cached read and the product cards carry the tags, so without the purge
 * an edit reached the site only when the revalidate window ran out. The
 * settings also purge `settings`, which the row's own switch is read from.
 */

export type TagActionResult = { error?: string; ok?: boolean; message?: string };

export type TagsFormState = TagActionResult;

function refusal(error: unknown, noun: string): TagActionResult {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only a store manager or an administrator can manage tags." };
    if (error.status === 422) {
      const first = Object.values(error.errors ?? {}).flat()[0];
      return { error: typeof first === "string" ? first : "That was rejected. Check it and try again." };
    }
  }

  return { error: `We could not ${noun}. Try again shortly.` };
}

function purge(settings = false) {
  updateTag("store-tags");
  updateTag("store-products");
  if (settings) updateTag("settings");
  revalidatePath("/admin/store/tags");
}

/** The three switches: `setting__<key>` inputs, the contract every settings screen keeps. */
export async function saveTagSettingsAction(_prev: TagsFormState, formData: FormData): Promise<TagsFormState> {
  const settings = [...formData.entries()]
    .filter(([name]) => name.startsWith("setting__"))
    .map(([name, value]) => ({ key: name.replace("setting__", ""), value: typeof value === "string" ? value.trim() : "" }));

  if (settings.length === 0) return { error: "Nothing to save." };

  try {
    await saveStoreTagSettings(settings);
  } catch (error) {
    return refusal(error, "save the tag settings");
  }

  purge(true);

  return { ok: true };
}

export async function createTagAction(_prev: TagsFormState, formData: FormData): Promise<TagsFormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (name === "") return { error: "Type the tag's name." };

  try {
    await createStoreTag(name);
  } catch (error) {
    return refusal(error, "add the tag");
  }

  purge();

  return { ok: true };
}

export async function renameTagAction(id: number, name: string): Promise<TagActionResult> {
  try {
    await updateStoreTag(id, { name });
  } catch (error) {
    return refusal(error, "rename the tag");
  }

  purge();

  return { ok: true };
}

export async function setTagShownAction(id: number, shown: boolean): Promise<TagActionResult> {
  try {
    await updateStoreTag(id, { is_visible: shown });
  } catch (error) {
    return refusal(error, "change the tag");
  }

  purge();

  return { ok: true };
}

export async function deleteTagAction(id: number): Promise<TagActionResult> {
  try {
    await deleteStoreTag(id);
  } catch (error) {
    return refusal(error, "delete the tag");
  }

  // Only a delete the API accepted purges anything.
  purge();

  return { ok: true };
}

export async function mergeTagAction(id: number, into: number): Promise<TagActionResult> {
  let moved = 0;

  try {
    moved = (await mergeStoreTag(id, into)).moved;
  } catch (error) {
    return refusal(error, "merge the tags");
  }

  purge();

  return { ok: true, message: moved === 1 ? "Merged. 1 product moved." : `Merged. ${moved} products moved.` };
}

export async function reorderTagsAction(ids: number[]): Promise<TagActionResult> {
  try {
    await reorderStoreTags(ids);
  } catch (error) {
    return refusal(error, "save the order");
  }

  purge();

  return { ok: true };
}

export async function autoTagAction(): Promise<TagActionResult & { tagged?: number }> {
  try {
    const { tagged } = await autoTagStoreProducts();
    purge();

    return { ok: true, tagged, message: tagged === 1 ? "Tagged 1 product." : `Tagged ${tagged} products.` };
  } catch (error) {
    return refusal(error, "tag the products");
  }
}

/**
 * The product form's Suggest button: the form's current words in, tags to
 * press out. Saves nothing and purges nothing.
 */
export async function suggestTagsAction(input: TagSuggestInput): Promise<{ tags?: string[]; source?: "ai" | "rules"; error?: string }> {
  try {
    return await suggestStoreTags(input);
  } catch (error) {
    return refusal(error, "suggest tags");
  }
}
