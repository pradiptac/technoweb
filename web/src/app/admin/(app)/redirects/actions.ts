"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createRedirect, deleteRedirect, updateRedirect, type RedirectPayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type RedirectFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): RedirectPayload {
  const code = str(formData, "status_code");

  return {
    from_path: str(formData, "from_path") ?? "",
    to_path: str(formData, "to_path") ?? "",
    status_code: code ? Number(code) : 301,
    is_active: formData.get("is_active") === "1",
  };
}

function toState(error: unknown): RedirectFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot manage redirects." };
  }
  return { error: "We could not save the redirect. Try again shortly." };
}

export async function createRedirectAction(_p: RedirectFormState, formData: FormData): Promise<RedirectFormState> {
  let id: number;
  try { id = (await createRedirect(payloadFrom(formData))).id; }
  catch (error) { return toState(error); }

  revalidatePath("/admin/redirects");
  redirect(`/admin/redirects/${id}?saved=1`);
}

export async function updateRedirectAction(_p: RedirectFormState, formData: FormData): Promise<RedirectFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing redirect id." };

  try { await updateRedirect(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/redirects");
  revalidatePath(`/admin/redirects/${id}`);
  redirect(`/admin/redirects/${id}?saved=1`);
}

export async function deleteRedirectAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteRedirect(id).catch(() => null);
  revalidatePath("/admin/redirects");
  redirect("/admin/redirects?deleted=1");
}
