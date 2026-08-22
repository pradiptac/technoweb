"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { clearSettingSecret, saveSettings } from "@/lib/admin";

export type SettingsFormState = { error?: string; ok?: boolean };

export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  // Field names are prefixed so they cannot collide with the form's own
  // controls; everything else in the payload is ignored by the API anyway,
  // which only writes keys that already exist.
  const settings = [...formData.entries()]
    .filter(([name]) => name.startsWith("setting__"))
    .map(([name, value]) => ({
      key: name.replace("setting__", ""),
      value: typeof value === "string" ? value.trim() : "",
    }));

  if (settings.length === 0) return { error: "Nothing to save." };

  try {
    await saveSettings(settings);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Only an administrator can change settings." };
      if (error.status === 422) return { error: "Some values were rejected. Check the fields and try again." };
    }
    return { error: "We could not save the settings. Try again shortly." };
  }

  revalidatePath("/admin/settings");
  // updateTag, not revalidateTag: in a Server Action this gives
  // read-your-own-writes, so an editor who saves a social link sees it in the
  // footer immediately rather than after the revalidate window expires.
  updateTag("settings");

  return { ok: true };
}

/**
 * Clearing a credential, which a blank save deliberately cannot do — see
 * ClearSecretButton.
 */
export async function clearSecretAction(key: string): Promise<{ error?: string }> {
  try {
    await clearSettingSecret(key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    return { error: "That did not clear. Try again." };
  }

  revalidatePath("/admin/settings");
  updateTag("settings");
  return {};
}
