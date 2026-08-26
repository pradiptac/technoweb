"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createService, deleteService, updateService, type ServicePayload } from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { FaqItem, PublishStatus } from "@/types/api";

export type ServiceFormState = { error?: string; fieldErrors?: Record<string, string[]> };

function payloadFrom(formData: FormData): ServicePayload {
  const seo = seoFromFormData(formData);
  const sortOrder = str(formData, "sort_order");

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    summary: str(formData, "summary"),
    body: str(formData, "body"),
    icon: str(formData, "icon"),
    status: (str(formData, "status") ?? "draft") as PublishStatus,
    sort_order: sortOrder ? Number(sortOrder) : 0,
    // An unticked checkbox submits nothing, so absence is the answer,
    // not a missing value to leave alone.
    show_in_menu: formData.get("show_in_menu") === "1",
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    ...(seo ? { seo: seo as ServicePayload["seo"] } : {}),
  };
}

function toState(error: unknown): ServiceFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit content." };
  }
  return { error: "We could not save the service. Try again shortly." };
}

export async function createServiceAction(_p: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  let id: number;
  try {
    id = (await createService(payloadFrom(formData))).id;
  } catch (error) { return toState(error); }

  revalidatePath("/admin/services");
  redirect(`/admin/services/${id}?saved=1`);
}

export async function updateServiceAction(_p: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing service id." };

  try { await updateService(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/services");
  revalidatePath(`/admin/services/${id}`);
  redirect(`/admin/services/${id}?saved=1`);
}

export async function deleteServiceAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await deleteService(id).catch(() => null);
  revalidatePath("/admin/services");
  redirect("/admin/services?deleted=1");
}
