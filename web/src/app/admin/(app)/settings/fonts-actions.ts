"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { removeCustomFont, saveCustomFont } from "@/lib/admin";
import { revalidateSettingsScreens } from "./revalidate";

export type FontActionState = { error?: string; ok?: string };

function reason(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return "Only an administrator can change the site's fonts.";
    // The field's own sentence when the API named one, the summary otherwise.
    const first = Object.values(error.errors ?? {})[0]?.[0];
    return first ?? error.message ?? fallback;
  }

  return fallback;
}

/**
 * Upload a font into a slot (0.125.0). The form's data goes to the API as
 * multipart; the API checks the file and answers with the slot. The settings
 * tag is purged because the root layout declares the faces from the public
 * settings — without it the new font would not be drawn for ten minutes.
 */
export async function uploadFontAction(slot: 1 | 2, data: FormData): Promise<FontActionState> {
  try {
    const saved = await saveCustomFont(slot, data);
    updateTag("settings");
    revalidateSettingsScreens();

    return { ok: `${saved.name ?? "The font"} is ready — choose it in the lists above, then save.` };
  } catch (error) {
    return { error: reason(error, "The font could not be uploaded.") };
  }
}

export async function removeFontAction(slot: 1 | 2): Promise<FontActionState> {
  try {
    await removeCustomFont(slot);
    updateTag("settings");
    revalidateSettingsScreens();

    return { ok: "The font was removed." };
  } catch (error) {
    return { error: reason(error, "The font could not be removed.") };
  }
}
