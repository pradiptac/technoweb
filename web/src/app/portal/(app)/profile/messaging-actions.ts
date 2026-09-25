"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { updateMessagingPreferences } from "@/lib/portal";

export type MessagingPreferencesState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

/**
 * The profile's messaging card. Each live channel is posted as a switch
 * (`1`/`0` through a hidden input beside its checkbox), so turning one off is
 * as explicit as turning it on; push can only be turned off here — it is
 * switched on per browser, with the bell.
 */
export async function saveMessagingPreferencesAction(
  _prev: MessagingPreferencesState,
  formData: FormData,
): Promise<MessagingPreferencesState> {
  const body: Partial<Record<"whatsapp" | "rcs" | "push", boolean>> = {};

  for (const channel of ["whatsapp", "rcs"] as const) {
    const values = formData.getAll(channel).map(String);
    if (values.length) body[channel] = values.includes("1");
  }

  if (formData.get("push_off") === "1") body.push = false;

  try {
    await updateMessagingPreferences(body);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/portal/login");
      if (error.status === 422) return { error: Object.values(error.errors ?? {})[0]?.[0] ?? "Check the options.", fieldErrors: error.errors };
    }
    return { error: "We could not save your message preferences. Try again shortly." };
  }

  revalidatePath("/portal/profile");
  return { ok: true };
}
