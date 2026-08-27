"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createLandingPage, deleteLandingPage, updateLandingPage, type LandingPagePayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type LandingFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): LandingPagePayload {
  const num = (k: string) => {
    const v = str(formData, k);
    return v ? Number(v) : null;
  };

  return {
    kind: str(formData, "kind") ?? undefined,
    brand_id: num("brand_id"),
    product_category_id: num("product_category_id"),
    solution_id: num("solution_id"),
    service_id: num("service_id"),
    location_id: num("location_id"),
    title: str(formData, "title") ?? "",
    heading: str(formData, "heading") ?? "",
    intro: str(formData, "intro"),
    body: str(formData, "body"),
    status: str(formData, "status") ?? "draft",
    seo: {
      title: str(formData, "seo_title"),
      description: str(formData, "seo_description"),
    },
  };
}

/**
 * A 422 here is usually the quality gate rather than a typo.
 *
 * Every reason it gives is a sentence written to be read by the person who
 * pressed the button — "this reads as 80% the same as X" is a fact they can act
 * on, and replacing it with "check the highlighted fields" would throw away the
 * only useful thing in the response. So the API's own words are surfaced, and
 * `status` is where they arrive because `status` is what was refused.
 */
function toState(error: unknown): LandingFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const gate = error.errors?.status;

      return {
        error: gate?.length
          ? "This cannot be published yet, so nothing was saved. Everything you have typed is still on this screen — either fix the reason below and publish, or set the status back to Draft and save to keep the text."
          : "Check the highlighted fields.",
        fieldErrors: error.errors,
      };
    }
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage landing pages." };
  }

  return { error: "We could not save this page. Try again shortly." };
}

export async function createLandingPageAction(_p: LandingFormState, formData: FormData): Promise<LandingFormState> {
  let id: number;
  try { id = (await createLandingPage(payloadFrom(formData))).id; }
  catch (error) { return toState(error); }

  revalidatePath("/admin/landing-pages");
  updateTag("landing-pages");
  redirect(`/admin/landing-pages/${id}?saved=1`);
}

export async function updateLandingPageAction(_p: LandingFormState, formData: FormData): Promise<LandingFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing page id." };

  try { await updateLandingPage(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/landing-pages");
  revalidatePath(`/admin/landing-pages/${id}`);
  // updateTag, not revalidateTag: the public page should reflect the edit now.
  updateTag("landing-pages");
  redirect(`/admin/landing-pages/${id}?saved=1`);
}

export async function deleteLandingPageAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  await deleteLandingPage(id).catch(() => null);
  revalidatePath("/admin/landing-pages");
  updateTag("landing-pages");
  redirect("/admin/landing-pages?deleted=1");
}

/**
 * Turn one opportunity into a draft.
 *
 * A draft, never a published page, and with no introduction — which is exactly
 * a page the gate will refuse until somebody writes one. That is the safety
 * property of the whole module expressed in one function: this button can be
 * pressed as many times as anyone likes and cannot put anything on the public
 * site.
 */
export async function draftOpportunityAction(formData: FormData) {
  const payload: LandingPagePayload = {
    kind: String(formData.get("kind") ?? ""),
    brand_id: formData.get("brand_id") ? Number(formData.get("brand_id")) : null,
    product_category_id: formData.get("product_category_id") ? Number(formData.get("product_category_id")) : null,
    solution_id: formData.get("solution_id") ? Number(formData.get("solution_id")) : null,
    service_id: formData.get("service_id") ? Number(formData.get("service_id")) : null,
    location_id: formData.get("location_id") ? Number(formData.get("location_id")) : null,
    title: String(formData.get("title") ?? ""),
    heading: String(formData.get("heading") ?? ""),
    status: "draft",
  };

  let id: number;
  try { id = (await createLandingPage(payload)).id; }
  catch { redirect("/admin/landing-pages/opportunities?failed=1"); }

  revalidatePath("/admin/landing-pages");
  redirect(`/admin/landing-pages/${id}?drafted=1`);
}
