"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import {
  createApiKey, deleteApiKey, revokeApiKey, rollApiKey, updateApiKey, type ApiKeyPayload,
} from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type ApiKeyFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Shown once after a create; the API cannot return it again. */
  key?: string;
  /** The row the key belongs to, so the create screen can link to it. */
  savedId?: number;
  savedName?: string;
};

const DAY = 86_400_000;

/**
 * The form's expiry choice as the API's `expires_at`.
 *
 * "In N days" is worked out here as an instant; "On a date" is the end of that
 * day in the API's own timezone (a bare date is read there, and midnight would
 * make today's date already past). An edit posts the stored expiry as
 * `expires_current`: a date left as it was goes back as the stored instant, so
 * a key whose expiry has passed can still have its name changed.
 */
function expiryFrom(formData: FormData): string | null {
  const choice = str(formData, "expiry");
  const days = Number(choice);

  if (days > 0) return new Date(Date.now() + days * DAY).toISOString();
  if (choice !== "date") return null;

  const on = str(formData, "expires_on");
  const current = str(formData, "expires_current");
  if (!on) return null;
  if (current && current.slice(0, 10) === on) return current;

  return `${on} 23:59:59`;
}

/** "On a date" with no date would silently save no expiry. */
function missingDate(formData: FormData): ApiKeyFormState | null {
  return str(formData, "expiry") === "date" && !str(formData, "expires_on")
    ? { error: "Check the highlighted fields.", fieldErrors: { expires_at: ["Choose the date the key should stop working."] } }
    : null;
}

function payloadFrom(formData: FormData): ApiKeyPayload {
  return {
    name: str(formData, "name") ?? "",
    scopes: formData.getAll("scopes").map(String).filter(Boolean),
    expires_at: expiryFrom(formData),
    allowed_ips: str(formData, "allowed_ips") ?? "",
  };
}

function toState(error: unknown): ApiKeyFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only an administrator can manage API keys." };
  }
  return { error: "We could not save the key. Try again shortly." };
}

/**
 * Create does not redirect.
 *
 * The key comes back exactly once and only its hash is kept, so navigating
 * away from it would lose it — the webhook secret's shape. The form stays put
 * and shows it until the administrator moves on.
 */
export async function createApiKeyAction(_p: ApiKeyFormState, formData: FormData): Promise<ApiKeyFormState> {
  const missing = missingDate(formData);
  if (missing) return missing;

  try {
    const created = await createApiKey(payloadFrom(formData));
    revalidatePath("/admin/api-keys");

    return { key: created.key, savedId: created.id, savedName: created.name };
  } catch (error) {
    return toState(error);
  }
}

export async function updateApiKeyAction(_p: ApiKeyFormState, formData: FormData): Promise<ApiKeyFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing key id." };
  const missing = missingDate(formData);
  if (missing) return missing;

  try {
    await updateApiKey(id, payloadFrom(formData));
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/admin/api-keys");
  revalidatePath(`/admin/api-keys/${id}`);
  redirect(`/admin/api-keys/${id}?done=api-key-saved`);
}

/** A new key in place of the old one. Returns it for the screen to show once; the old one is dead already. */
export async function rollApiKeyAction(id: number): Promise<{ key?: string; error?: string }> {
  try {
    const rolled = await rollApiKey(id);
    revalidatePath("/admin/api-keys");
    revalidatePath(`/admin/api-keys/${id}`);

    return { key: rolled.key };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 422) return { error: "A revoked key cannot be rolled. Make a new one instead." };

    return { error: "We could not roll the key. Try again shortly." };
  }
}

export async function revokeApiKeyAction(id: number) {
  try {
    await revokeApiKey(id);
  } catch {
    redirect(`/admin/api-keys/${id}?done=api-key-not-revoked`);
  }

  revalidatePath("/admin/api-keys");
  revalidatePath(`/admin/api-keys/${id}`);
  redirect(`/admin/api-keys/${id}?done=api-key-revoked`);
}

export async function deleteApiKeyAction(id: number) {
  try {
    await deleteApiKey(id);
  } catch {
    redirect(`/admin/api-keys/${id}?done=api-key-not-deleted`);
  }

  revalidatePath("/admin/api-keys");
  redirect("/admin/api-keys?done=api-key-deleted");
}
