import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { AdminStoreTag, StoreTagsMeta } from "@/types/store-tags";

/**
 * Store → Tags (0.141.0, `docs/store.md` "Tags"). Its own module beside
 * `store.ts` so the tag screen's reads and writes are found in one place.
 */

export type AdminStoreTagList = { data: AdminStoreTag[]; meta: StoreTagsMeta };

export async function getStoreTags(): Promise<AdminStoreTagList> {
  return apiFetch<AdminStoreTagList>("/admin/store/tags", { token: await token() });
}

/**
 * Every tag's name, for the product form's suggestions as you type. Read from
 * the products index's `meta.tags` — one cheap request the form already makes
 * for its other vocabularies — and `[]` on any failure: a form that cannot
 * open because a suggestion list was unavailable is worse than a field
 * without suggestions.
 */
export async function getStoreTagNames(): Promise<string[]> {
  try {
    const res = await apiFetch<{ meta?: { tags?: string[] } }>("/admin/store/products?per_page=1", { token: await token() });

    return Array.isArray(res.meta?.tags) ? res.meta.tags : [];
  } catch {
    return [];
  }
}

export async function createStoreTag(name: string): Promise<AdminStoreTag> {
  const res = await apiFetch<{ data: AdminStoreTag }>("/admin/store/tags", {
    method: "POST", body: { name }, token: await token(),
  });
  return res.data;
}

export async function updateStoreTag(id: number, payload: { name?: string; is_visible?: boolean }): Promise<AdminStoreTag> {
  const res = await apiFetch<{ data: AdminStoreTag }>(`/admin/store/tags/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteStoreTag(id: number): Promise<void> {
  await apiFetch<void>(`/admin/store/tags/${id}`, { method: "DELETE", token: await token() });
}

export async function mergeStoreTag(id: number, into: number): Promise<{ moved: number }> {
  const res = await apiFetch<{ data: { moved: number } }>(`/admin/store/tags/${id}/merge`, {
    method: "POST", body: { into }, token: await token(),
  });
  return res.data;
}

export async function reorderStoreTags(ids: number[]): Promise<void> {
  await apiFetch<void>("/admin/store/tags/reorder", { method: "PATCH", body: { ids }, token: await token() });
}

export async function saveStoreTagSettings(settings: { key: string; value: string }[]): Promise<void> {
  await apiFetch<void>("/admin/store/tags/settings", { method: "PATCH", body: { settings }, token: await token() });
}

export async function autoTagStoreProducts(): Promise<{ tagged: number; untagged: number }> {
  const res = await apiFetch<{ data: { tagged: number; untagged: number } }>("/admin/store/tags/auto", {
    method: "POST", token: await token(),
  });
  return res.data;
}

export type TagSuggestInput = {
  name?: string;
  short_description?: string;
  description?: string;
  specifications?: Record<string, string>;
  brand_id?: number | null;
  store_category_id?: number | null;
  type?: string;
  current?: string[];
};

export async function suggestStoreTags(input: TagSuggestInput): Promise<{ tags: string[]; source: "ai" | "rules" }> {
  const res = await apiFetch<{ data: { tags: string[]; source: "ai" | "rules" } }>("/admin/store/products/tag-suggest", {
    method: "POST", body: input, token: await token(),
  });
  return res.data;
}
