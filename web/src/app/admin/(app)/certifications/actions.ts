"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";

import { ApiError } from "@/lib/api";
import {
  createCertification, deleteCertification, updateCertification, type CertificationPayload,
} from "@/lib/admin";

export type CertificationState = { error?: string; fieldErrors?: Record<string, string[]> };

function payload(formData: FormData): CertificationPayload {
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  return {
    name: str("name"),
    issuer: str("issuer") || null,
    certificate_number: str("certificate_number") || null,
    image_path: str("image_path") || null,
    file_path: str("file_path") || null,
    // A blank date field is "unknown", not the epoch.
    issued_on: str("issued_on") || null,
    valid_until: str("valid_until") || null,
    description: str("description") || null,
    status: str("status"),
    sort_order: Number(str("sort_order")) || 0,
  };
}

function fail(error: unknown): CertificationState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: error.message, fieldErrors: error.errors };

    return { error: error.message };
  }

  return { error: "We could not save that. Try again." };
}

/**
 * `updateTag` for read-your-own-writes on `/certifications`, and the two
 * pages that hold a cached render of the same list — the homepage strip and
 * About — revalidated by path. The `popups` actions are the template.
 */
function published(): void {
  updateTag("certifications");
  revalidatePath("/");
  revalidatePath("/about");
}

export async function createCertificationAction(_prev: CertificationState, formData: FormData): Promise<CertificationState> {
  let id: number;

  try {
    const row = await createCertification(payload(formData));
    id = row.id;
    published();
  } catch (error) {
    return fail(error);
  }

  // Outside the try: `redirect()` throws, and a catch would swallow it.
  redirect(`/admin/certifications/${id}?done=created`);
}

export async function updateCertificationAction(id: number, _prev: CertificationState, formData: FormData): Promise<CertificationState> {
  try {
    await updateCertification(id, payload(formData));
    published();
  } catch (error) {
    return fail(error);
  }

  redirect(`/admin/certifications/${id}?done=saved`);
}

export async function deleteCertificationAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));

  if (Number.isFinite(id) && id > 0) {
    await deleteCertification(id).catch(() => null);
    published();
  }

  redirect("/admin/certifications?done=certification-deleted");
}
