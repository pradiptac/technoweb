"use server";

import { apiFetch, ApiError } from "@/lib/api";

export type EnquiryState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

export async function submitEnquiryAction(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const body: Record<string, string> = {};
  for (const key of ["name", "email", "phone", "company", "subject", "message", "source", "website"]) {
    const v = formData.get(key);
    if (typeof v === "string" && v !== "") body[key] = v;
  }

  // The honeypot is validated server-side by Laravel too, but bouncing it here
  // saves a round trip and keeps obvious bots out of the enquiries table.
  if (body.website) return { ok: true };

  try {
    await apiFetch("/enquiries", { method: "POST", body });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 429) return { error: "That is a lot of messages in a short time. Wait a minute and try again." };
    }
    return { error: "We could not send your message. Call us on the number above and we will pick it up straight away." };
  }

  return { ok: true };
}
