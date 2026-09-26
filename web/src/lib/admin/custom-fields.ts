import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  AdminCustomFieldGroup, CustomFieldGroupDefinition, CustomFieldGroupMeta, Paginated,
} from "@/types/api";

/**
 * Custom fields (docs/custom-content.md): the group screens, and the one
 * read every entity's "new" form makes for its Fields tab.
 */

/**
 * The custom field groups that apply to an entity, from its own admin
 * index's `meta.custom_field_groups` — the `getAnswerBlockKinds` shape, and
 * for the same reason: the page asks *its own* index, so a store manager who
 * cannot read `/admin/custom-field-groups` still gets the store product's
 * groups. An edit reads the record's own `custom_field_groups` instead.
 *
 * `[]` on any failure: a form with no Fields tab is better than a form that
 * will not open.
 */
export async function getCustomFieldGroups(indexPath: string): Promise<CustomFieldGroupDefinition[]> {
  try {
    const sep = indexPath.includes("?") ? "&" : "?";
    const res = await apiFetch<{ meta?: { custom_field_groups?: CustomFieldGroupDefinition[] } }>(
      `${indexPath}${sep}per_page=1`,
      { token: await token() },
    );

    return Array.isArray(res.meta?.custom_field_groups) ? res.meta.custom_field_groups : [];
  } catch {
    return [];
  }
}

export type CustomFieldGroupPayload = Partial<{
  name: string;
  slug: string | null;
  targets: string[];
  placement: "details" | "hidden";
  sort_order: number;
  is_active: boolean;
  fields: {
    id?: number;
    key: string;
    label: string;
    kind: string;
    help?: string | null;
    required?: boolean;
    show_on_page?: boolean;
    options?: { value: string; label: string }[];
    settings?: Record<string, unknown>;
  }[];
}>;

export async function getCustomFieldGroupList(
  params: { q?: string; target?: string; page?: number; per_page?: number } = {},
): Promise<Paginated<AdminCustomFieldGroup> & { meta: Paginated<AdminCustomFieldGroup>["meta"] & CustomFieldGroupMeta }> {
  return apiFetch(`/admin/custom-field-groups${query(params)}`, { token: await token() });
}

export async function getCustomFieldGroupMeta(): Promise<CustomFieldGroupMeta> {
  const res = await getCustomFieldGroupList({ per_page: 1 });
  return { kinds: res.meta.kinds, targets: res.meta.targets, placements: res.meta.placements };
}

export async function getCustomFieldGroup(id: number): Promise<{ data: AdminCustomFieldGroup; meta: CustomFieldGroupMeta }> {
  return apiFetch(`/admin/custom-field-groups/${id}`, { token: await token() });
}

export async function createCustomFieldGroup(payload: CustomFieldGroupPayload): Promise<AdminCustomFieldGroup> {
  const res = await apiFetch<{ data: AdminCustomFieldGroup }>("/admin/custom-field-groups", {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateCustomFieldGroup(id: number, payload: CustomFieldGroupPayload): Promise<AdminCustomFieldGroup> {
  const res = await apiFetch<{ data: AdminCustomFieldGroup }>(`/admin/custom-field-groups/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteCustomFieldGroup(id: number): Promise<void> {
  await apiFetch<void>(`/admin/custom-field-groups/${id}`, { method: "DELETE", token: await token() });
}
