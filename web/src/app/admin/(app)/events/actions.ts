"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createEvent, createEventRegistration, deleteEvent, deleteEventRegistration, duplicateEvent, updateEvent,
  updateEventRegistration,
  type AdminEventAgendaItem, type EventPayload, type EventRegistrationUpdate, type EventSpeakerPayload,
} from "@/lib/admin";
import { jsonListFromFormData, seoFromFormData, str } from "@/lib/admin-form";
import type { FaqItem } from "@/types/api";

export type EventFormState = { error?: string; fieldErrors?: Record<string, string[]> };

/** A whole number from a form field, or null when it is blank or not a number. */
function int(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The flat form as the API's payload.
 *
 * Blank is null rather than "": the API tells "cleared" from "unchanged" by
 * it, and a blank slug has to be null or one cannot be derived from the
 * title. The two times go **as typed** — `Y-m-d\TH:i`, a wall clock with no
 * offset — because that is what the API reads them as, in the site's own
 * zone; converting here would shift every event by the editor's distance
 * from it.
 *
 * `speakers`, `agenda` and `faqs` are always sent. Each is replaced wholesale
 * and an absent key means "leave them alone", so removing the last speaker
 * has to post `[]` or the speaker would quietly stay.
 */
function payloadFrom(formData: FormData, editing: boolean): EventPayload {
  const seo = seoFromFormData(formData);
  const maxSeats = int(formData, "max_seats");

  return {
    title: str(formData, "title") ?? "",
    slug: str(formData, "slug"),
    summary: str(formData, "summary"),
    body: str(formData, "body"),
    status: str(formData, "status") ?? "draft",
    is_featured: formData.get("is_featured") === "1",
    format: str(formData, "format") ?? "in_person",
    starts_at: str(formData, "starts_at"),
    ends_at: str(formData, "ends_at"),
    venue_name: str(formData, "venue_name"),
    venue_city: str(formData, "venue_city"),
    venue_address: str(formData, "venue_address"),
    map_url: str(formData, "map_url"),
    online_url: str(formData, "online_url"),
    cover_image_path: str(formData, "cover_image_path"),
    speakers: jsonListFromFormData<EventSpeakerPayload>(formData, "speakers"),
    agenda: jsonListFromFormData<AdminEventAgendaItem>(formData, "agenda"),
    registration_mode: str(formData, "registration_mode") ?? "none",
    external_url: str(formData, "external_url"),
    capacity: int(formData, "capacity"),
    // An unticked box posts nothing, so absence is false — and it is sent
    // either way, or the waiting list could never be switched off.
    waitlist_enabled: formData.get("waitlist_enabled") === "1",
    // Left out when blank: a new event then takes the default from Events → Settings.
    ...(maxSeats !== null ? { max_seats: maxSeats } : {}),
    registration_closes_at: str(formData, "registration_closes_at"),
    faqs: jsonListFromFormData<FaqItem>(formData, "faqs"),
    ...(seo ? { seo } : {}),
    ...(editing ? { notify_registrants: formData.get("notify_registrants") === "1" } : {}),
  };
}

function toState(error: unknown): EventFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Your account cannot edit events." };
    if (error.status === 404) return { error: "That event no longer exists." };
  }
  return { error: "We could not save the event. Try again shortly." };
}

/*
 * `updateTag("events")` first, then the console paths. The public list and
 * every event page are ISR-cached under that tag, so without it a save would
 * reach the site only when the fetch's revalidate window ran out — and
 * `updateTag` rather than `revalidateTag` gives the editor who saved their
 * own change on the next request.
 */
function refresh(id?: number) {
  updateTag("events");
  revalidatePath("/admin/events");
  if (id) revalidatePath(`/admin/events/${id}`);
}

export async function createEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  let id: number;

  try {
    id = (await createEvent(payloadFrom(formData, false))).id;
  } catch (error) {
    return toState(error);
  }

  refresh();
  redirect(`/admin/events/${id}?done=event-created`);
}

export async function updateEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing event id." };

  const payload = payloadFrom(formData, true);

  try {
    await updateEvent(id, payload);
  } catch (error) {
    return toState(error);
  }

  refresh(id);
  // The registrations screen draws the event's date in its header.
  revalidatePath(`/admin/events/${id}/registrations`);
  redirect(`/admin/events/${id}?done=${payload.notify_registrants ? "event-saved-notified" : "event-saved"}`);
}

/**
 * Where a one-press form came from, so a refusal lands back on the screen it
 * was pressed on with its filters intact.
 *
 * The value is a hidden input, which is to say whatever the browser sent: it
 * is used only when it is the events list (with a query string of ordinary
 * characters) or one event's own screen, and is the bare list otherwise.
 */
function backTo(formData: FormData): string {
  const raw = formData.get("back");
  const path = typeof raw === "string" ? raw : "";

  return /^\/admin\/events(\/\d+)?(\?[\w=&%.+-]*)?$/.test(path) ? path : "/admin/events";
}

/** `path` with `?done=<key>` added to whatever query it already carries. */
function withDone(path: string, key: string): string {
  const [pathname, search = ""] = path.split("?");
  const query = new URLSearchParams(search);
  query.delete("done");
  query.set("done", key);

  return `${pathname}?${query}`;
}

/**
 * Delete an event that nobody registered for.
 *
 * The API refuses with a 422 while the event has registrations, and that
 * refusal is *said* — its own key, naming the alternative — rather than
 * folded into "could not delete": people are registered, and archiving is
 * what takes the event off the site while keeping them. Only a delete the API
 * accepted purges anything.
 */
export async function deleteEventAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  let refused: string | null = null;
  try {
    await deleteEvent(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    refused = error instanceof ApiError && error.status === 422 ? "event-has-registrations" : "event-not-deleted";
  }

  if (refused) redirect(withDone(backTo(formData), refused));

  refresh();
  redirect("/admin/events?done=event-deleted");
}

/** A draft copy with no registrations, opened straight away so its date can be changed. */
export async function duplicateEventAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  let copy: number | null = null;
  try {
    copy = (await duplicateEvent(id)).id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
  }

  if (copy === null) redirect(withDone(backTo(formData), "event-not-duplicated"));

  // A draft: nothing public changed, so only the console's list is refreshed.
  revalidatePath("/admin/events");
  redirect(`/admin/events/${copy}?done=event-duplicated`);
}

/* ------------------------------------------------------------ registrations */

export type RegistrationActionState = {
  /** Set by a write that worked and stays on the screen it was made from. */
  ok?: boolean;
  /** The status the API settled on — a staff add past a full event may still be waitlisted. */
  status?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function refreshRegistrations(eventId: number) {
  revalidatePath(`/admin/events/${eventId}/registrations`);
  // The list's seats meter and the edit form's "tell everyone" tick both read the counts.
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
}

/** What a refusal says: the API's sentence for the field it names, else its message. */
function refusal(error: unknown): RegistrationActionState {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 422) {
      const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
      return { error: first ?? error.message, fieldErrors: error.errors };
    }
    if (error.status === 403) return { error: "Your account cannot change registrations." };
    if (error.status === 404) return { error: "That registration no longer exists. Reload the list." };
  }
  return { error: "We could not save that. Try again." };
}

/**
 * One move from the list's row: a status.
 *
 * Returned rather than redirected, because the row stays where it is either
 * way and a refusal belongs under the select that was refused — "Attended"
 * before the event has started, most often. Cancelling emails the registrant
 * and promotes the waiting list; the API does both, and the refreshed list
 * shows who moved up. `force` confirms past the capacity, and is sent only
 * from the row's "Confirm anyway" — a second press, never a default.
 */
export async function moveRegistrationAction(
  eventId: number, registrationId: number, change: Pick<EventRegistrationUpdate, "status" | "force">,
): Promise<RegistrationActionState> {
  try {
    await updateEventRegistration(eventId, registrationId, change);
  } catch (error) {
    return refusal(error);
  }

  refreshRegistrations(eventId);
  return { ok: true };
}

/** The seats and the desk's own note, from the row's dialog. */
export async function saveRegistrationAction(
  eventId: number, registrationId: number, _prev: RegistrationActionState, formData: FormData,
): Promise<RegistrationActionState> {
  const seats = int(formData, "seats");
  if (seats === null) return { error: "Say how many seats.", fieldErrors: { seats: ["Say how many seats."] } };

  try {
    await updateEventRegistration(eventId, registrationId, {
      seats,
      staff_note: str(formData, "staff_note"),
      // Only when ticked: the desk may overbook, but only by saying so.
      ...(formData.get("force") === "1" ? { force: true } : {}),
    });
  } catch (error) {
    return refusal(error);
  }

  refreshRegistrations(eventId);
  return { ok: true };
}

/**
 * Staff adding a registration by hand — somebody who rang, or a colleague's
 * guest. The public fields, plus the two decisions only the desk may take:
 * going past the capacity or a closed date, and whether the confirmation is
 * emailed.
 */
export async function addRegistrationAction(
  eventId: number, _prev: RegistrationActionState, formData: FormData,
): Promise<RegistrationActionState> {
  let status: string;

  try {
    const registration = await createEventRegistration(eventId, {
      name: str(formData, "name") ?? "",
      email: str(formData, "email") ?? "",
      phone: str(formData, "phone"),
      company: str(formData, "company"),
      seats: int(formData, "seats") ?? 1,
      note: str(formData, "note"),
      force: formData.get("force") === "1",
      notify: formData.get("notify") === "1",
    });
    status = registration.status;
  } catch (error) {
    return refusal(error);
  }

  refreshRegistrations(eventId);
  return { ok: true, status };
}

/**
 * Delete one registration, for good.
 *
 * A one-press form on the list, so the outcome goes into the URL: the row it
 * was pressed on is gone by the time anything could render there. A refusal
 * says so and changes nothing. The filters and the page are carried back.
 */
export async function deleteRegistrationAction(formData: FormData): Promise<void> {
  const eventId = Number(formData.get("event_id"));
  const registrationId = Number(formData.get("registration_id"));
  if (!eventId || !registrationId) return;

  let done = "event-registration-deleted";
  try {
    await deleteEventRegistration(eventId, registrationId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    done = "event-registration-not-deleted";
  }

  const query = new URLSearchParams({ done });
  for (const key of ["status", "q", "per_page"] as const) {
    const value = formData.get(key);
    if (typeof value === "string" && value) query.set(key, value);
  }
  const page = Number(formData.get("page"));
  if (page > 1) query.set("page", String(page));

  if (done === "event-registration-deleted") refreshRegistrations(eventId);
  redirect(`/admin/events/${eventId}/registrations?${query}`);
}
