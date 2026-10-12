"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import {
  createSupportCentre, deleteSupportCentre, updateSupportCentre, type SupportCentrePayload,
} from "@/lib/admin";

export type SupportCentreState = { error?: string; fieldErrors?: Record<string, string[]> };

function payload(formData: FormData): SupportCentrePayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const num = (k: string) => (str(k) === "" ? null : Number(str(k)));
  let staff: SupportCentrePayload["staff"];
  try {
    staff = JSON.parse(str("staff") || "[]");
  } catch {
    staff = [];
  }

  return {
    name: str("name"),
    slug: str("slug") || null,
    kind: str("kind"),
    country_code: str("country_code"),
    region: str("region") || null,
    city: str("city"),
    address: str("address") || null,
    phone: str("phone") || null,
    phone_alt: str("phone_alt") || null,
    email: str("email") || null,
    hours: str("hours") || null,
    latitude: num("latitude"),
    longitude: num("longitude"),
    sort_order: Number(str("sort_order")) || 0,
    is_active: formData.get("is_active") === "1",
    staff,
  };
}

function fail(error: unknown): SupportCentreState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
    return { error: error.message };
  }
  return { error: "We could not save that. Try again." };
}

/** The public page and anything drawing it in a builder section. */
function published(): void {
  updateTag("support-centres");
  updateTag("pages");
  revalidatePath("/support-network");
}

export async function createSupportCentreAction(_prev: SupportCentreState, formData: FormData): Promise<SupportCentreState> {
  let id: number;
  try {
    id = (await createSupportCentre(payload(formData))).id;
    published();
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/support-centres/${id}?done=created`);
}

export async function updateSupportCentreAction(id: number, _prev: SupportCentreState, formData: FormData): Promise<SupportCentreState> {
  try {
    await updateSupportCentre(id, payload(formData));
    published();
  } catch (error) {
    return fail(error);
  }
  redirect(`/admin/support-centres/${id}?done=saved`);
}

/** Purges only once the API accepted the delete. */
export async function deleteSupportCentreAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  let ok = false;
  if (Number.isFinite(id) && id > 0) {
    ok = await deleteSupportCentre(id).then(() => true).catch(() => false);
    if (ok) published();
  }
  redirect(ok ? "/admin/support-centres?done=support-centre-deleted" : `/admin/support-centres/${id}?done=not-deleted`);
}
