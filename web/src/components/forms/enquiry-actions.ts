"use server";

import { apiFetch, ApiError } from "@/lib/api";

export type EnquiryState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> };

export async function submitEnquiryAction(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const body: Record<string, string> = {};
  /*
    The underscore-prefixed keys are the page envelope — where the form was,
    what sent them there — and they have to be listed here or they are dropped
    before the request is even made. This allowlist is why: the action copies
    named keys rather than forwarding the whole FormData, so a field nobody
    added to it is silently absent rather than obviously broken.
  */
  const keys = [
    "name", "email", "phone", "company", "subject", "message", "source", "website",
    "_source_url", "_source_title", "_referrer", "_utm_source", "_utm_medium", "_utm_campaign",
  ];
  for (const key of keys) {
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
