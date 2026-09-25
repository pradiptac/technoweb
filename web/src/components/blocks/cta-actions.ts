"use server";

import { apiFetch, ApiError } from "@/lib/api";

/**
 * A CTA banner's form — an inline newsletter, a gated download or a webinar
 * registration — posted to `POST /blocks/{slug}/submit`.
 *
 * Through a Server Action like every public form, so the API origin stays
 * server-side. The keys are an allowlist, the enquiry form's rule: the page
 * envelope (`_source_*`) has to be listed or it is dropped before the
 * request is made, and a field nobody listed is absent rather than broken.
 */

export type CtaFormState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** A gated download's file, handed over only after the form is sent. */
  download?: string | null;
};

const KEYS = [
  "name", "email", "company", "phone", "website",
  "_source_url", "_source_title", "_referrer", "_utm_source", "_utm_medium", "_utm_campaign",
];

export async function submitCtaAction(slug: string, _prev: CtaFormState, form: FormData): Promise<CtaFormState> {
  const body: Record<string, string> = {};
  for (const key of KEYS) {
    const v = form.get(key);
    if (typeof v === "string" && v !== "") body[key] = v;
  }

  try {
    const res = await apiFetch<{ message?: string; data?: { url?: string | null } }>(
      `/blocks/${encodeURIComponent(slug)}/submit`,
      { method: "POST", body },
    );
    return { ok: res?.message ?? "Thank you.", download: res?.data?.url ?? null };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 429) return { error: "That is a lot of requests in a short time. Wait a minute and try again." };
      if (error.status === 403) return { error: "Signup is closed at the moment." };
    }
    return { error: "We could not send that. Please try again in a moment." };
  }
}
