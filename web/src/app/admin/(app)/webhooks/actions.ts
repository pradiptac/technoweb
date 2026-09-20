"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createWebhook, deleteWebhook, pingWebhook, redeliverWebhook, updateWebhook, type WebhookPayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type WebhookFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Shown once after a create or a rotate; the API cannot return it again. */
  secret?: string;
  /** The row the secret belongs to, so the create screen can link to it. */
  savedId?: number;
  savedName?: string;
};

function payloadFrom(formData: FormData): WebhookPayload {
  return {
    name: str(formData, "name") ?? "",
    url: str(formData, "url") ?? "",
    is_active: formData.get("is_active") === "1",
    events: formData.getAll("events").map(String).filter(Boolean),
  };
}

function toState(error: unknown): WebhookFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only an administrator can manage webhooks." };
  }
  return { error: "We could not save the webhook. Try again shortly." };
}

/**
 * Create does not redirect.
 *
 * The secret comes back exactly once and is unrecoverable afterwards, so
 * navigating away from it would lose it — the same shape as a generated staff
 * password. The form stays put and shows it until the administrator moves on.
 */
export async function createWebhookAction(_p: WebhookFormState, formData: FormData): Promise<WebhookFormState> {
  try {
    const created = await createWebhook(payloadFrom(formData));
    revalidatePath("/admin/webhooks");

    return { secret: created.secret, savedId: created.id, savedName: created.name };
  } catch (error) {
    return toState(error);
  }
}

/**
 * Update redirects — unless the secret was rotated, in which case the new one
 * is on this response only and the screen has to stay to show it.
 */
export async function updateWebhookAction(_p: WebhookFormState, formData: FormData): Promise<WebhookFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing webhook id." };

  const rotate = formData.get("rotate_secret") === "1";

  let saved;
  try {
    saved = await updateWebhook(id, { ...payloadFrom(formData), ...(rotate ? { rotate_secret: true } : {}) });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/webhooks");
  revalidatePath(`/admin/webhooks/${id}`);

  if (rotate && saved.secret) {
    return { secret: saved.secret, savedId: saved.id, savedName: saved.name };
  }

  redirect(`/admin/webhooks/${id}?done=saved`);
}

export async function deleteWebhookAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await deleteWebhook(id);
  } catch {
    redirect(`/admin/webhooks/${id}?done=webhook-not-deleted`);
  }

  revalidatePath("/admin/webhooks");
  redirect("/admin/webhooks?done=webhook-deleted");
}

/** One-press: queue a `ping` and land on the deliveries tab to watch it arrive. */
export async function pingWebhookAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await pingWebhook(id);
  } catch {
    redirect(`/admin/webhooks/${id}?done=webhook-ping-failed&tab=deliveries`);
  }

  revalidatePath(`/admin/webhooks/${id}`);
  redirect(`/admin/webhooks/${id}?done=webhook-pinged&tab=deliveries`);
}

/** One-press: a fresh delivery with the same payload. */
export async function redeliverAction(formData: FormData) {
  const id = Number(formData.get("id"));
  const delivery = Number(formData.get("delivery"));
  if (!id || !delivery) return;

  try {
    await redeliverWebhook(id, delivery);
  } catch {
    redirect(`/admin/webhooks/${id}?done=webhook-ping-failed&tab=deliveries`);
  }

  revalidatePath(`/admin/webhooks/${id}`);
  redirect(`/admin/webhooks/${id}?done=delivery-resent&tab=deliveries`);
}
