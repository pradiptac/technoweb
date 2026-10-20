import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { InstallKey, PresetSetting, PresetSettingsMeta, PresetTile } from "@/types/presets";

/*
 * Content-type presets' console half (docs/content-presets.md): the presets
 * strip, a preset type's own settings, and an investor document's email
 * alert. All `role:content_manager`.
 */

export async function getPresets(): Promise<PresetTile[]> {
  const res = await apiFetch<{ data: PresetTile[] }>("/admin/content-types/presets", { token: await token() });
  return res.data;
}

export async function installPreset(key: InstallKey, body: { slug?: string; coverage_slug?: string } = {}) {
  return apiFetch<{ data: { id: number; slug: string; plural: string }[] }>(`/admin/content-types/presets/${key}`, {
    method: "POST", body, token: await token(),
  });
}

export async function getPresetSettings(typeId: number) {
  return apiFetch<{ data: PresetSetting[]; meta: PresetSettingsMeta }>(`/admin/content-types/${typeId}/preset-settings`, {
    token: await token(),
  });
}

export async function savePresetSettings(typeId: number, settings: { key: string; value: string | null }[]) {
  return apiFetch<{ message: string; data: PresetSetting[]; meta: PresetSettingsMeta }>(`/admin/content-types/${typeId}/preset-settings`, {
    method: "PATCH", body: { settings }, token: await token(),
  });
}

export async function sendInvestorAlert(typeSlug: string, entryId: number) {
  return apiFetch<{ message: string }>(`/admin/content-types/${typeSlug}/entries/${entryId}/alert`, {
    method: "POST", token: await token(),
  });
}
