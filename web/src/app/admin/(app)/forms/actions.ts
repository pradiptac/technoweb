"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { createForm, deleteForm, updateForm, type FormFieldPayload } from "@/lib/admin";
import { ApiError } from "@/lib/api";

export type FormState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The fields arrive as one JSON string rather than as thirty numbered inputs.
 *
 * Same reasoning as the slide repeater: the builder already holds the fields
 * as objects, and reordering becomes a state change instead of a rename of
 * every input after the one that moved.
 */
function readFields(formData: FormData): FormFieldPayload[] | undefined {
  const raw = formData.get("fields");
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
    submit_label: String(formData.get("submit_label") ?? "Send").trim() || "Send",
    success_message: String(formData.get("success_message") ?? "").trim() || null,
    notify_email: String(formData.get("notify_email") ?? "").trim() || null,
    fields: readFields(formData),
  };
}

function fail(error: unknown): FormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
    return { error: error.message };
  }
  return { error: "We could not save that. Try again." };
}

export async function createFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let id: number;
  try {
    const form = await createForm(payload(formData));
    id = form.id;
    updateTag(`form:${form.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/forms/${id}?saved=1`);
}

export async function updateFormAction(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const form = await updateForm(id, payload(formData));
    updateTag(`form:${form.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/forms/${id}?saved=1`);
}

export async function deleteFormAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  if (!id) return;

  await deleteForm(id).catch(() => null);
  if (slug) updateTag(`form:${slug}`);
  redirect("/admin/forms?deleted=1");
}
