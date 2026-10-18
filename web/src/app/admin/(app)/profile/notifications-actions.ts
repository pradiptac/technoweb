"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { removeStaffPush, saveNotificationSettings, sendTestAlert, sendTestDigest, subscribeStaffPush } from "@/lib/admin";
import type { NotificationPrefs } from "@/types/notifications";

export type NotificationsState = { ok?: string; error?: string; fieldErrors?: Record<string, string[]> };

const bool = (form: FormData, key: string) => form.get(key) === "1";

export async function saveNotificationsAction(_prev: NotificationsState, form: FormData): Promise<NotificationsState> {
  const userId = Number(form.get("user_id")) || undefined;
  const alerts: Record<string, boolean> = {};
  for (const key of form.getAll("alert_keys").map(String)) alerts[key] = bool(form, `alert__${key}`);

  const body: Partial<NotificationPrefs> = {
    digest: String(form.get("digest")) as NotificationPrefs["digest"],
    digest_hour: Number(form.get("digest_hour")),
    digest_weekday: Number(form.get("digest_weekday")),
    digest_skip_quiet: bool(form, "digest_skip_quiet"),
    alerts,
    alert_email: bool(form, "alert_email"),
    alert_push: bool(form, "alert_push"),
    quiet_start: String(form.get("quiet_start")),
    quiet_end: String(form.get("quiet_end")),
  };
  const result = await saveNotificationSettings(body, userId);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath(userId ? `/admin/users/${userId}` : "/admin/profile");

  return { ok: "Saved." };
}

export type Outcome = { ok?: string; error?: string };

/** An action that throws reaches the error boundary and replaces the screen; these say what went wrong instead. */
async function outcome(run: () => Promise<string | void>): Promise<Outcome> {
  try {
    return { ok: (await run()) ?? "Done." };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.status === 429 ? "Too many tries. Wait a minute and press it again." : error.message };
    throw error;
  }
}

export async function sendTestDigestAction(): Promise<Outcome> { return outcome(sendTestDigest); }
export async function sendTestAlertAction(): Promise<Outcome> { return outcome(sendTestAlert); }

export async function subscribePushAction(pushToken: string): Promise<Outcome> {
  const result = await outcome(() => subscribeStaffPush(pushToken));
  if (result.ok) revalidatePath("/admin/profile");

  return result;
}

export async function removePushAction(id: number): Promise<Outcome> {
  const result = await outcome(() => removeStaffPush(id));
  if (result.ok) revalidatePath("/admin/profile");

  return result;
}
