"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { createLocation, deleteLocation, updateLocation, type LocationPayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type LocationFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): LocationPayload {
  const order = str(formData, "sort_order");
  const parent = str(formData, "parent_id");

  /*
   * `state` is gone as a field. It is derived from the nearest ancestor now, so
   * a form that still posted one would be writing a second answer to a question
   * `parent_id` already answers — and the two would disagree the first time a
   * place was moved.
   */
  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug") ?? undefined,
    parent_id: parent ? Number(parent) : null,
    level: str(formData, "level") ?? "city",
    // Replaced wholesale, the rule every relation here follows. `getAll` rather
    // than `get`: an unchecked box sends nothing, and a single `get` would read
    // one ticked service as the whole list.
    service_ids: formData.getAll("service_ids").map(Number).filter(Boolean),
    solution_ids: formData.getAll("solution_ids").map(Number).filter(Boolean),
    office_address: str(formData, "office_address"),
    response_time: str(formData, "response_time"),
    summary: str(formData, "summary"),
    sort_order: order ? Number(order) : 0,
    is_active: formData.get("is_active") === "1",
  };
}

function toState(error: unknown): LocationFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage places." };
  }

  return { error: "We could not save this place. Try again shortly." };
}

export async function createLocationAction(_p: LocationFormState, formData: FormData): Promise<LocationFormState> {
  let id: number;
  try { id = (await createLocation(payloadFrom(formData))).id; }
  catch (error) { return toState(error); }

  revalidatePath("/admin/locations");
  redirect(`/admin/locations/${id}?saved=1`);
}

export async function updateLocationAction(_p: LocationFormState, formData: FormData): Promise<LocationFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing id." };

  try { await updateLocation(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${id}`);
  // A place's own detail is rendered on every page about it.
  updateTag("landing-pages");
  redirect(`/admin/locations/${id}?saved=1`);
}

/**
 * Deleting is refused by the API while pages point at the place.
 *
 * The refusal is a 422 with a sentence in it, so it is surfaced rather than
 * swallowed — this is the one action here whose failure a person has to read
 * and act on, and "nothing happened" would be the worst possible answer.
 */
export async function deleteLocationAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await deleteLocation(id);
  } catch (error) {
    const why = error instanceof ApiError && error.message ? error.message : "That place could not be deleted.";
    redirect(`/admin/locations/${id}?blocked=${encodeURIComponent(why)}`);
  }

  revalidatePath("/admin/locations");
  redirect("/admin/locations?deleted=1");
}
