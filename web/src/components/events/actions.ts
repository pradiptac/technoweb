"use server";

import { revalidatePath } from "next/cache";
import { ApiError, eventApi } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { isEventSlug, isRegistrationToken } from "@/components/events/data";

export type RegisterState = {
  ok?: boolean;
  /** `confirmed`, or `waitlisted` when the event was full and a waiting list is on. */
  status?: "confirmed" | "waitlisted";
  /** The API's own sentence — it says which of the two happened, and where the email went. */
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Register for an event (`POST /events/{slug}/register`,
 * docs/events-contract.md).
 *
 * **The portal token is forwarded when there is one**, so a signed-in
 * customer's registration is filed under their account. The route is public,
 * and on a public route the API sees nobody unless the header is there — the
 * trap `CLAUDE.md` records twice, on blog comments and on the chatbot.
 * `apiFetch` adds the visitor's address itself (the call is uncached), which
 * is what the endpoint's ten-a-minute limit counts.
 *
 * **Every refusal comes back as words to show**, never as a thrown error:
 * the form is the only thing on screen that can explain itself. A 422 on
 * `registration` is the event saying no — closed, started, full — and is the
 * panel's headline rather than a field's; a 422 on `seats` ("Only 1 seat is
 * left.") belongs under the seats control, where `fieldErrors` puts it.
 *
 * The honeypot travels as it arrived. A filled one gets the API's ordinary
 * success and stores nothing, so a bot is told nothing it can act on.
 *
 * **The answer holds no link to the registration**, and this action adds
 * none. The page that views or cancels one is addressed by a token that
 * goes to the inbox that was typed, in the confirmation email, and nowhere
 * else — so typing somebody else's address here gets a sentence, never the
 * means to cancel their place. A repeat from the same address is answered
 * exactly like a first registration, and is shown exactly like one.
 * Nothing is purged: an anonymous submission must never be able to turn the
 * cache over.
 */
export async function registerForEventAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
  };

  const slug = value("slug") ?? "";
  if (!isEventSlug(slug)) return { error: "We could not tell which event this was for. Reload the page and try again." };

  const name = value("name");
  const email = value("email");
  const seats = Number(value("seats") ?? "1");

  // The two the API requires, said here so an empty press costs no round trip
  // and none of the visitor's ten attempts a minute.
  const missing: Record<string, string[]> = {};
  if (!name) missing.name = ["Tell us who is coming."];
  if (!email) missing.email = ["We need an email address to send your confirmation to."];
  if (Object.keys(missing).length > 0) return { error: "Two details are needed to hold your place.", fieldErrors: missing };

  let result;

  try {
    result = await eventApi.register(slug, {
      name: name ?? "",
      email: email ?? "",
      phone: value("phone"),
      company: value("company"),
      seats: Number.isInteger(seats) && seats > 0 ? seats : 1,
      note: value("note"),
      website: value("website"),
      _source_url: value("_source_url"),
      _source_title: value("_source_title"),
      _referrer: value("_referrer"),
      _utm_source: value("_utm_source"),
      _utm_medium: value("_utm_medium"),
      _utm_campaign: value("_utm_campaign"),
    }, await getToken());
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) {
        const refusal = error.errors?.registration?.[0];
        return {
          error: refusal ?? (error.errors ? "Check the highlighted fields." : error.message),
          fieldErrors: error.errors,
        };
      }
      if (error.status === 429) return { error: "That is a lot of attempts in a short time. Wait a minute and try again." };
      if (error.status === 404) return { error: "This event is no longer open for registration." };
    }

    return { error: "We could not reach our system, so nothing was sent. Try again in a moment." };
  }

  return {
    ok: true,
    status: result.data?.status === "waitlisted" ? "waitlisted" : "confirmed",
    message: result.message,
  };
}

export type CancelState = { error?: string };

/**
 * Cancel a registration, from the page its emailed link opens.
 *
 * The token is bound in by that page, which read it from its own address —
 * it is the page's secret and the only thing that authorises this. On
 * success the page is re-rendered and says "Cancelled" itself: the button
 * that was pressed exists only while the API reports `can_cancel`, so a
 * success message returned into that component would unmount with it
 * (`CLAUDE.md`, "an admin action whose button is conditional on the status
 * it changes"). A refusal changes nothing, keeps the button, and is shown
 * beside it.
 */
export async function cancelEventRegistrationAction(token: string): Promise<CancelState> {
  if (!isRegistrationToken(token)) return { error: "This link is not valid. Open the link in your confirmation email again." };

  try {
    await eventApi.cancelRegistration(token);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.errors?.registration?.[0] ?? error.message };
      if (error.status === 404) return { error: "This link is not valid any more." };
      if (error.status === 429) return { error: "That is a lot of attempts in a short time. Wait a minute and try again." };
    }

    return { error: "We could not cancel it just now. Try again in a moment, or reply to your confirmation email." };
  }

  revalidatePath(`/events/registration/${token}`);

  return {};
}
