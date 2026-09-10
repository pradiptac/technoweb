"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import { createPopup, deletePopup, updatePopup, type PopupPayload } from "@/lib/admin";

export type PopupState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The form's fields, read off the FormData.
 *
 * `sections` and `paths` are the only two that are not a plain scalar.
 * Checkboxes post one entry per ticked box under the same name, so
 * `getAll` is what collects them — and an empty selection posts **nothing at
 * all**, which is why the key is always sent as an array rather than omitted:
 * omitting it means "leave them alone" to the API, and somebody who unticked
 * their last section would find it silently kept.
 */
function payload(formData: FormData): PopupPayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  return {
    name: str("name"),
    status: str("status"),
    image_path: str("image_path"),
    link_url: str("link_url") || null,
    link_new_tab: formData.get("link_new_tab") === "on",

    sections: formData.getAll("sections").map(String).filter(Boolean),
    /*
     * One pattern per line, the shape every multi-line setting in this console
     * already uses. Blank lines are dropped rather than sent as empty strings,
     * which the API would refuse for not looking like a path.
     */
    paths: str("paths").split(/\r?\n/).map((x) => x.trim()).filter(Boolean),

    size: str("size"),
    frequency: str("frequency"),
    delay_ms: Number(str("delay_ms")) || 0,

    // A blank datetime-local field is "no window", not the epoch.
    starts_at: str("starts_at") || null,
    ends_at: str("ends_at") || null,
    sort_order: Number(str("sort_order")) || 0,
  };
}

function fail(error: unknown): PopupState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };

    return { error: error.message };
  }

  return { error: "We could not save that. Try again." };
}

/**
 * Both writes turn the public list over.
 *
 * `updateTag`, not `revalidateTag` — read-your-own-writes, so an editor who
 * publishes a popup and goes to look at the site sees it rather than waiting
 * out the 600s window. The tag is the **set** (`popups`) because there is no
 * per-popup public read to invalidate: the site asks for every live one at
 * once, so publishing one has to turn the whole list over.
 *
 * `revalidatePath("/", "layout")` as well, because the fetch lives in the
 * marketing layout and every public page holds a cached render of it.
 */
function published(): void {
  updateTag("popups");
  revalidatePath("/", "layout");
}

export async function createPopupAction(_prev: PopupState, formData: FormData): Promise<PopupState> {
  let id: number;

  try {
    const popup = await createPopup(payload(formData));
    id = popup.id;
    published();
  } catch (error) {
    return fail(error);
  }

  // Outside the try: `redirect()` works by throwing, and a catch that tries to
  // recognise it swallows it instead — the record is created while the screen
  // says it is not.
  redirect(`/admin/popups/${id}?done=created`);
}

export async function updatePopupAction(id: number, _prev: PopupState, formData: FormData): Promise<PopupState> {
  try {
    await updatePopup(id, payload(formData));
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/popups/${id}?done=saved`);
}

export async function deletePopupAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (Number.isFinite(id) && id > 0) {
    await deletePopup(id).catch(() => null);
    published();
  }

  redirect("/admin/popups?done=popup-deleted");
}
