"use server";

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  addMeetingHostTimeOff, authorizeMeetingsGoogle, cancelMeeting, completeMeetingsGoogle, createMeeting,
  createMeetingType, deleteMeetingHostTimeOff, deleteMeetingType, disconnectMeetingsGoogle,
  getAdminMeetingSlots, moveMeeting, resyncMeeting, saveMeetingHostHours, testMeetingsGoogle,
  updateMeeting, updateMeetingType, type MeetingTypePayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";
import type { AdminMeetingSlotDate, MeetingHost, MeetingHostHours, MeetingStatus } from "@/types/meetings";
import { revalidateSettingsScreens } from "../settings/revalidate";

/*
  Every change a console screen makes to a meeting, a type, a host or the
  Google connection (docs/meetings-contract.md, "Console"). A refusal comes
  back as the API's own sentence for the field it names; a success either
  redirects with a `?done=` key (the toast bridge) or returns what changed.
*/

export type MeetingActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Set when the chosen time was taken between choosing and pressing — the
   * form remounts its slot picker on it, which clears the start and fetches
   * the day again. A counter so two refusals in a row are two remounts.
   */
  taken?: number;
  /** The day that was being looked at, so the remounted picker opens on it. */
  date?: string;
  ok?: string;
};

export type MeetingResult = { ok?: string; error?: string };

/** The API's sentence for the field it names, else its message, else the fallback. */
function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Your account cannot do that here.";

    const first = Object.values(error.errors ?? {})[0]?.[0];

    return first || error.message || fallback;
  }

  return fallback;
}

function refusal(error: unknown, fallback: string, date?: string): MeetingActionState {
  if (error instanceof ApiError && error.status === 422) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return {
      error: first ?? error.message,
      fieldErrors: error.errors,
      // A 422 on `start` is "that time was just taken" (or a cap reached on
      // it): either way the chosen time is no good, so the picker starts again.
      taken: error.errors?.start ? Date.now() : undefined,
      date,
    };
  }

  return { error: reason(error, fallback), date };
}

function refresh(reference?: string) {
  revalidatePath("/admin/meetings");
  revalidatePath("/admin/my-meetings");
  revalidatePath("/admin");
  if (reference) {
    revalidatePath(`/admin/meetings/${reference}`);
    revalidatePath(`/admin/my-meetings/${reference}`);
  }
}

const tick = (formData: FormData, key: string) => formData.get(key) === "1";

/* ---- Slots ------------------------------------------------------------------ */

/**
 * One day's free times for the console's picker. A read, but through a
 * Server Action because the picker is a client component and the token
 * lives in an httpOnly cookie.
 */
export async function fetchMeetingSlotsAction(query: {
  type: string; date: string; host?: number | null; outside_hours?: boolean; google_busy?: boolean; exclude?: string | null;
}): Promise<{ data?: AdminMeetingSlotDate; error?: string }> {
  if (!query.type || !/^\d{4}-\d{2}-\d{2}$/.test(query.date)) return { error: "Choose a type and a day." };

  try {
    return { data: await getAdminMeetingSlots(query) };
  } catch (error) {
    return { error: reason(error, "We could not load the times for that day.") };
  }
}

/* ---- The desk ----------------------------------------------------------------- */

/** "Schedule a meeting": an existing customer or new contact details, a type, a host or any, a time. */
export async function createMeetingAction(_prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const date = str(formData, "date") ?? undefined;
  const type = str(formData, "type");
  const start = str(formData, "start");

  if (!type) return { error: "Choose the kind of meeting.", fieldErrors: { type: ["Choose the kind of meeting."] }, date };
  if (!start) return { error: "Choose a time.", fieldErrors: { start: ["Choose a time."] }, date };

  const host = str(formData, "host_id");
  const customer = str(formData, "customer_id");

  let reference: string;
  try {
    const meeting = await createMeeting({
      type,
      start,
      host_id: host ? Number(host) : null,
      customer_id: customer ? Number(customer) : null,
      name: str(formData, "name") ?? "",
      email: str(formData, "email") ?? "",
      phone: str(formData, "phone"),
      company: str(formData, "company"),
      agenda: str(formData, "agenda"),
      outside_hours: tick(formData, "outside_hours"),
      override_google_busy: tick(formData, "override_google_busy"),
    });
    reference = meeting.reference;
  } catch (error) {
    return refusal(error, "We could not schedule that meeting. Try again.", date);
  }

  refresh(reference);
  redirect(`/admin/meetings/${reference}?done=meeting-scheduled`);
}

/** A new time, and perhaps a different host. The customer is told by the API. */
export async function moveMeetingAction(reference: string, _prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const date = str(formData, "date") ?? undefined;
  const start = str(formData, "start");
  if (!start) return { error: "Choose the new time.", fieldErrors: { start: ["Choose the new time."] }, date };

  const host = str(formData, "host_id");

  try {
    await moveMeeting(reference, {
      start,
      host_id: host ? Number(host) : null,
      outside_hours: tick(formData, "outside_hours"),
      override_google_busy: tick(formData, "override_google_busy"),
    });
  } catch (error) {
    return refusal(error, "We could not move the meeting. Try again.", date);
  }

  refresh(reference);
  redirect(`/admin/meetings/${reference}?done=meeting-moved`);
}

export async function cancelMeetingAction(reference: string, _prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  try {
    await cancelMeeting(reference, str(formData, "reason"));
  } catch (error) {
    return refusal(error, "We could not cancel the meeting. Try again.");
  }

  refresh(reference);
  redirect(`/admin/meetings/${reference}?done=meeting-cancelled`);
}

/**
 * The outcome and the desk's note. `mine` is a host working their own diary
 * through `my-meetings`, which is scoped to them by the API.
 */
export async function updateMeetingAction(
  reference: string, mine: boolean, _prev: MeetingActionState, formData: FormData,
): Promise<MeetingActionState> {
  const payload: { staff_note?: string | null; status?: MeetingStatus } = {};

  const note = formData.get("staff_note");
  if (typeof note === "string") payload.staff_note = note.trim() || null;

  const status = formData.get("status");
  if (status === "completed" || status === "no_show") payload.status = status;

  try {
    await updateMeeting(reference, payload, mine);
  } catch (error) {
    return refusal(error, "We could not save that. Try again.");
  }

  refresh(reference);
  redirect(`/admin/${mine ? "my-meetings" : "meetings"}/${reference}?done=saved`);
}

/** Retry a Google sync that failed; the API queues it and answers the meeting as it now stands. */
export async function resyncMeetingAction(reference: string): Promise<MeetingResult> {
  try {
    const meeting = await resyncMeeting(reference);
    refresh(reference);

    return { ok: meeting.google.status === "synced" ? "It is in Google Calendar now." : "Queued. The status updates when Google answers." };
  } catch (error) {
    return { error: reason(error, "We could not retry the sync.") };
  }
}

/* ---- Types (`role:sales_manager`) --------------------------------------------- */

function typePayload(formData: FormData): MeetingTypePayload {
  const n = (key: string, fallback: number) => {
    const v = str(formData, key);
    return v !== null && /^-?\d+$/.test(v) ? Number(v) : fallback;
  };

  return {
    name: str(formData, "name") ?? "",
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    minutes: n("minutes", 30),
    buffer_before: n("buffer_before", 0),
    buffer_after: n("buffer_after", 0),
    is_public: formData.get("is_public") === "1",
    is_active: formData.get("is_active") === "1",
    sort_order: n("sort_order", 0),
    host_ids: formData.getAll("host_ids").map(Number).filter((id) => Number.isInteger(id) && id > 0),
  };
}

/**
 * A type is what the public booking page offers, so every change purges its
 * cached options — `updateTag("meetings")`, the tag that page is fetched under.
 */
export async function createMeetingTypeAction(_prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  try {
    await createMeetingType(typePayload(formData));
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    return { error: reason(error, "We could not save the type. Try again.") };
  }

  updateTag("meetings");
  revalidatePath("/admin/meetings/types");
  redirect("/admin/meetings/types?done=created");
}

export async function updateMeetingTypeAction(_prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing type id." };

  try {
    await updateMeetingType(id, typePayload(formData));
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    return { error: reason(error, "We could not save the type. Try again.") };
  }

  updateTag("meetings");
  revalidatePath("/admin/meetings/types");
  revalidatePath(`/admin/meetings/types/${id}`);
  redirect(`/admin/meetings/types/${id}?done=saved`);
}

/**
 * Refused by the API while the type has meetings — switching it off is the
 * answer then, and the API's sentence says so. Nothing is purged on a refusal.
 */
export async function deleteMeetingTypeAction(_prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing type id." };

  try {
    await deleteMeetingType(id);
  } catch (error) {
    return { error: reason(error, "We could not delete the type.") };
  }

  updateTag("meetings");
  revalidatePath("/admin/meetings/types");
  redirect("/admin/meetings/types?done=meeting-type-deleted");
}

/* ---- Hosts (`role:admin`) ------------------------------------------------------- */

export async function saveHostHoursAction(id: number, hours: MeetingHostHours[]): Promise<MeetingResult & { host?: MeetingHost }> {
  try {
    const host = await saveMeetingHostHours(id, hours);
    revalidatePath("/admin/meetings/hosts");

    return { ok: hours.length ? "Hours saved." : "Back on the default hours.", host };
  } catch (error) {
    return { error: reason(error, "We could not save those hours.") };
  }
}

export async function addTimeOffAction(id: number, _prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const starts = str(formData, "starts_at");
  const ends = str(formData, "ends_at");
  if (!starts || !ends) {
    return { error: "Give both ends of the time off.", fieldErrors: { ...(starts ? {} : { starts_at: ["From when?"] }), ...(ends ? {} : { ends_at: ["Until when?"] }) } };
  }

  try {
    await addMeetingHostTimeOff(id, { starts_at: starts, ends_at: ends, note: str(formData, "note") });
  } catch (error) {
    return refusal(error, "We could not add that time off.");
  }

  revalidatePath("/admin/meetings/hosts");
  return { ok: "Time off added." };
}

export async function deleteTimeOffAction(id: number, timeOffId: number): Promise<MeetingResult> {
  try {
    await deleteMeetingHostTimeOff(id, timeOffId);
  } catch (error) {
    return { error: reason(error, "We could not remove that time off.") };
  }

  revalidatePath("/admin/meetings/hosts");
  return { ok: "Removed." };
}

/* ---- The Google Workspace calendar (`role:admin`) ------------------------------ */

/**
 * Start the consent. The backups Drive shape: the origin read from the
 * request, so the callback registered is the host the administrator is on,
 * and a redirect out of the action.
 */
export async function connectMeetingsGoogleAction(): Promise<MeetingResult> {
  const host = (await headers()).get("host");
  const proto = (await headers()).get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  let url: string;
  try {
    url = await authorizeMeetingsGoogle(`${proto}://${host}`);
  } catch (error) {
    return { error: reason(error, "We could not start the connection. Save the client ID and secret first.") };
  }

  redirect(url);
}

export async function finishMeetingsGoogleConnection(code: string, state: string): Promise<MeetingResult> {
  try {
    const account = await completeMeetingsGoogle(code, state);
    revalidateSettingsScreens();

    return { ok: account };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { error: "Only an administrator can connect the meetings calendar." };
    }
    return { error: reason(error, "That connection did not complete. Start again from Meetings → Settings.") };
  }
}

export async function disconnectMeetingsGoogleAction(): Promise<MeetingResult> {
  try {
    await disconnectMeetingsGoogle();
    revalidateSettingsScreens();
    updateTag("meetings");

    return { ok: "Disconnected. New meetings get a calendar file instead of a Google invitation until it is connected again." };
  } catch (error) {
    return { error: reason(error, "We could not disconnect the calendar.") };
  }
}

export async function testMeetingsGoogleAction(): Promise<MeetingResult> {
  try {
    const { account, calendar } = await testMeetingsGoogle();
    revalidateSettingsScreens();

    return {
      ok: `Google answered${account ? ` as ${account}` : ""}${calendar ? `, and the calendar “${calendar}” can be reached` : ""}.`,
    };
  } catch (error) {
    revalidateSettingsScreens();
    return { error: reason(error, "Google did not answer.") };
  }
}
