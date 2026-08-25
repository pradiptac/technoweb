"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { createSlider, deleteSlider, updateSlider, type SlidePayload } from "@/lib/admin";
import { ApiError } from "@/lib/api";

export type SliderState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Slides arrive as a JSON string in one field rather than as twenty numbered
 * inputs.
 *
 * The repeater is a client component that already holds the slides as objects
 * — serialising once is simpler than flattening them into `slides[0][kind]`
 * names and parsing that back, and it means reordering is a state change
 * rather than a renaming of every input after the one that moved.
 */
function readSlides(formData: FormData): SlidePayload[] | undefined {
  const raw = formData.get("slides");
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function payload(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "published"),
    autoplay: formData.get("autoplay") === "1",
    interval_ms: Number(formData.get("interval_ms")) || 6000,
    slides: readSlides(formData),
  };
}

function fail(error: unknown): SliderState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
    return { error: error.message };
  }
  return { error: "We could not save that. Try again." };
}

export async function createSliderAction(_prev: SliderState, formData: FormData): Promise<SliderState> {
  let id: number;
  try {
    const slider = await createSlider(payload(formData));
    id = slider.id;
    // The public page reads this by slug, so the tag is the slug.
    updateTag(`slider:${slider.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/sliders/${id}?saved=1`);
}

export async function updateSliderAction(id: number, _prev: SliderState, formData: FormData): Promise<SliderState> {
  try {
    const slider = await updateSlider(id, payload(formData));
    updateTag(`slider:${slider.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/sliders/${id}?saved=1`);
}

export async function deleteSliderAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  if (!id) return;

  await deleteSlider(id).catch(() => null);
  if (slug) updateTag(`slider:${slug}`);
  redirect("/admin/sliders?deleted=1");
}
