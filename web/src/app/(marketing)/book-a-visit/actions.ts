"use server";

import { cookies } from "next/headers";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { placeVisit, readPreferred, visitCookieName, visitCookiePath, type VisitRequestPayload } from "@/lib/visits";

export type VisitRequestState = {
  ok?: boolean;
  reference?: string;
  email?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Send the request, then say what happens next.
 *
 * The portal token is forwarded when there is one, so a signed-in customer's
 * request is filed under their account — the API reads the guard by name
 * (`$request->user('sanctum')`), and without the header a public route sees
 * nobody at all (CLAUDE.md, "reads as working").
 *
 * The access token comes back once. It goes straight into an httpOnly cookie
 * scoped to `/visit/{reference}`, so the "view or change it" link on the
 * success panel opens the request without the secret ever being in a URL.
 */
export async function requestVisitAction(_prev: VisitRequestState, formData: FormData): Promise<VisitRequestState> {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
  };
  const id = (key: string) => {
    const raw = value(key);
    return raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
  };

  const payload: VisitRequestPayload = {
    name: value("name") ?? "",
    email: value("email") ?? "",
    phone: value("phone") ?? "",
    company: value("company"),
    site_address: {
      line1: value("site_line1"),
      line2: value("site_line2"),
      city: value("site_city"),
      state: value("site_state"),
      pin: value("site_pin"),
      country: value("site_country") ?? "India",
    },
    service_id: id("service_id"),
    solution_id: id("solution_id"),
    location_id: id("location_id"),
    notes: value("notes"),
    preferred: readPreferred(formData),
    message_opt_in: formData.getAll("message_opt_in").map(String),
    website: value("website"),
    _source_url: value("_source_url"),
    _source_title: value("_source_title"),
    _referrer: value("_referrer"),
    _utm_source: value("_utm_source"),
    _utm_medium: value("_utm_medium"),
    _utm_campaign: value("_utm_campaign"),
  };

  let reference: string;
  let accessToken: string;

  try {
    const res = await placeVisit(payload, await getToken());
    reference = res.data.reference;
    accessToken = res.data.access_token;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 429) return { error: "That is a lot of requests in a short time. Wait a minute and try again." };
      if (error.status === 403) return { error: error.message };
    }

    return { error: "We could not send your request. Call us and we will book it over the phone." };
  }

  (await cookies()).set(visitCookieName(reference), accessToken, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: visitCookiePath(reference), maxAge: 60 * 60 * 24 * 90,
  });

  return { ok: true, reference, email: payload.email };
}
