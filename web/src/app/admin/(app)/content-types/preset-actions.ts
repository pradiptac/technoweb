"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { ApiError } from "@/lib/api";
import { installPreset, savePresetSettings } from "@/lib/admin";
import { str } from "@/lib/admin-form";
import type { InstallKey } from "@/types/presets";

/*
 * The presets strip and a preset type's own settings (docs/content-presets.md).
 * `redirect()` stays outside every `try`: it throws, and a catch that tries
 * to recognise it swallows it instead.
 */

export type PresetFormState = { ok?: string; error?: string; fieldErrors?: Record<string, string[]> };

const KEYS: InstallKey[] = ["newsroom", "investors", "testimonials", "awards"];

export async function installPresetAction(_prev: PresetFormState, formData: FormData): Promise<PresetFormState> {
  const key = str(formData, "key") as InstallKey | null;
  if (!key || !KEYS.includes(key)) return { error: "Choose a preset." };

  let first: { id: number; slug: string } | undefined;
  try {
    const res = await installPreset(key, { slug: str(formData, "slug") ?? undefined, coverage_slug: str(formData, "coverage_slug") ?? undefined });
    first = res.data[0];
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) return { error: error.message || "Check the address.", fieldErrors: error.errors };
      if (error.status === 403) return { error: "Your account cannot install presets." };
    }
    return { error: "We could not install the preset. Try again shortly." };
  }

  updateTag("content-types");
  updateTag("menu");
  redirect(first ? `/admin/content/${first.slug}?done=preset-installed` : "/admin/content-types?done=preset-installed");
}

export async function savePresetSettingsAction(_prev: PresetFormState, formData: FormData): Promise<PresetFormState> {
  const typeId = Number(str(formData, "type_id"));
  const keys = String(formData.get("keys") ?? "").split(",").filter(Boolean);
  if (!Number.isInteger(typeId) || keys.length === 0) return { error: "Nothing to save." };

  try {
    await savePresetSettings(typeId, keys.map((key) => ({ key, value: str(formData, `setting__${key}`) })));
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) {
        // The API keys its errors by row; name the row's field instead.
        const fieldErrors: Record<string, string[]> = {};
        for (const [path, messages] of Object.entries(error.errors ?? {})) {
          const row = path.match(/^settings\.(\d+)\./);
          const key = row ? keys[Number(row[1])] : undefined;
          if (key) fieldErrors[`setting__${key}`] = messages;
        }
        return { error: "Check the highlighted fields.", fieldErrors };
      }
    }
    return { error: "We could not save these settings. Try again shortly." };
  }

  // The archive, the release pages and the investors page draw these.
  updateTag("settings");
  return { ok: "Saved." };
}
