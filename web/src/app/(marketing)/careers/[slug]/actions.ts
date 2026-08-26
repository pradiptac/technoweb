"use server";

import { apiUpload, ApiError } from "@/lib/api";

export type ApplyState = {
  sent?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Sends the application, file and all.
 *
 * The `FormData` is passed through to the API rather than rebuilt: the CV is a
 * file, and taking it apart to put it back together is how a multipart body
 * loses its boundary. `apiUpload` deliberately does not set `Content-Type` for
 * the same reason.
 */
export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const slug = String(formData.get("slug") ?? "");
  const cv = formData.get("cv");

  if (!slug) return { error: "We could not tell which role this was for. Reload the page." };

  if (!(cv instanceof File) || cv.size === 0) {
    return { fieldErrors: { cv: ["Attach your CV so we know what you have done."] } };
  }

  try {
    await apiUpload<{ message: string }>(`/careers/${slug}/apply`, formData);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) {
        return { error: error.errors ? undefined : error.message, fieldErrors: error.errors };
      }
      if (error.status === 429) {
        return { error: "That is a lot of applications from one connection. Wait a minute." };
      }
    }
    return { error: "We could not reach our system. Nothing was sent — try again shortly." };
  }

  return { sent: true };
}
