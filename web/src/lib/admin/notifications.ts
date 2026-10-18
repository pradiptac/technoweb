import "server-only";
import { ApiError, apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { NotificationPrefs, NotificationSettings } from "@/types/notifications";

const path = (userId?: number) => `/admin/notifications/preferences${userId ? `?user=${userId}` : ""}`;

export async function getNotificationSettings(userId?: number): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>(path(userId), { token: await token() });
}

export async function saveNotificationSettings(
  body: Partial<NotificationPrefs>, userId?: number,
): Promise<{ ok: true; settings: NotificationSettings } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  try {
    return { ok: true, settings: await apiFetch<NotificationSettings>(path(userId), { method: "PATCH", body, token: await token() }) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return { ok: false, error: error.message, fieldErrors: error.errors ?? undefined };
    }
    throw error;
  }
}

export async function sendTestDigest(): Promise<string> {
  return (await apiFetch<{ message: string }>("/admin/notifications/digest/send", { method: "POST", token: await token() })).message;
}

export async function sendTestAlert(): Promise<string> {
  return (await apiFetch<{ message: string }>("/admin/notifications/alerts/test", { method: "POST", token: await token() })).message;
}

export async function subscribeStaffPush(pushToken: string): Promise<void> {
  await apiFetch("/admin/push/subscribe", { method: "POST", body: { token: pushToken }, token: await token() });
}

export async function removeStaffPush(id: number): Promise<void> {
  await apiFetch(`/admin/push/${id}`, { method: "DELETE", token: await token() });
}
