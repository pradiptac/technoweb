"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import {
  createGallery, deleteGallery, updateGallery,
  type GalleryGroupPayload, type GalleryItemPayload,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";

export type GalleryState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The tabs and the pictures arrive as two JSON strings rather than as a few
 * hundred numbered inputs.
 *
 * Same reasoning as the slide repeater: the editors are client components that
 * already hold their rows as objects, and serialising once beats flattening
 * them into `items[0][title]` names and parsing that back. It also means
 * reordering is a state change rather than a renaming of every input after the
 * one that moved — which, at 200 pictures, is the difference between a
 * reorder and a re-render of the entire form.
 */
function readJson<T>(formData: FormData, key: string): T[] | undefined {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

function payload(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim() || undefined,
    subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    status: String(formData.get("status") ?? "published"),
    transition: String(formData.get("transition") ?? "fade"),
    autoplay: formData.get("autoplay") === "1",
    interval_ms: Number(formData.get("interval_ms")) || 5000,
    groups: readJson<GalleryGroupPayload>(formData, "groups"),
    items: readJson<GalleryItemPayload>(formData, "items"),
  };
}

function fail(error: unknown): GalleryState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
    return { error: error.message };
  }
  return { error: "We could not save that. Try again." };
}

export async function createGalleryAction(_prev: GalleryState, formData: FormData): Promise<GalleryState> {
  let id: number;
  try {
    const gallery = await createGallery(payload(formData));
    id = gallery.id;
    // The public page reads this by slug, so the tag is the slug.
    updateTag(`gallery:${gallery.slug}`);
  } catch (error) {
    return fail(error);
  }
  // Outside the try: redirect() works by throwing, and a catch that tried to
  // recognise it would swallow it — the record created while the screen said
  // it had not been.
  redirect(`/admin/galleries/${id}?saved=1`);
}

export async function updateGalleryAction(id: number, _prev: GalleryState, formData: FormData): Promise<GalleryState> {
  try {
    const gallery = await updateGallery(id, payload(formData));
    updateTag(`gallery:${gallery.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/galleries/${id}?saved=1`);
}

export async function deleteGalleryAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  if (!id) return;

  await deleteGallery(id).catch(() => null);
  if (slug) updateTag(`gallery:${slug}`);
  redirect("/admin/galleries?deleted=1");
}
