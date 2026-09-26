import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type {
  AdminContentType, AdminEntry, AnswerBlock, AnswerBlockKindOption, ContentTypeMeta, CustomFieldGroupDefinition,
  FaqItem, Paginated, PublishStatus, SeoOverride,
} from "@/types/api";

/**
 * Custom content types and their entries (docs/custom-content.md). A type
 * is addressed by id; its entries by the type's **slug** and their own id,
 * because the console's URL is `/admin/content/{type}`.
 */

export type ContentTypePayload = Partial<{
  name: string;
  plural: string;
  slug: string;
  icon: string | null;
  description: string | null;
  has_body: boolean;
  has_image: boolean;
  archive_enabled: boolean;
  per_page: number;
  sort: string;
  schema_type: string;
  sort_order: number;
  is_active: boolean;
}>;

export async function getContentTypeList(
  params: { q?: string; page?: number; per_page?: number } = {},
): Promise<Paginated<AdminContentType> & { meta: Paginated<AdminContentType>["meta"] & ContentTypeMeta }> {
  return apiFetch(`/admin/content-types${query(params)}`, { token: await token() });
}

export async function getContentType(id: number): Promise<{ data: AdminContentType; meta: ContentTypeMeta }> {
  return apiFetch(`/admin/content-types/${id}`, { token: await token() });
}

export async function createContentType(payload: ContentTypePayload): Promise<AdminContentType> {
  const res = await apiFetch<{ data: AdminContentType }>("/admin/content-types", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateContentType(id: number, payload: ContentTypePayload): Promise<AdminContentType> {
  const res = await apiFetch<{ data: AdminContentType }>(`/admin/content-types/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteContentType(id: number): Promise<void> {
  await apiFetch<void>(`/admin/content-types/${id}`, { method: "DELETE", token: await token() });
}

export type EntryListMeta = Paginated<AdminEntry>["meta"] & {
  type: AdminContentType;
  statuses: { value: PublishStatus; label: string }[];
  answer_block_kinds: AnswerBlockKindOption[];
  custom_field_groups: CustomFieldGroupDefinition[];
};

export async function getEntries(
  type: string,
  params: { q?: string; status?: string; page?: number; per_page?: number } = {},
): Promise<Paginated<AdminEntry> & { meta: EntryListMeta }> {
  return apiFetch(`/admin/content-types/${encodeURIComponent(type)}/entries${query(params)}`, { token: await token() });
}

export async function getEntry(type: string, id: number): Promise<AdminEntry> {
  const res = await apiFetch<{ data: AdminEntry }>(`/admin/content-types/${encodeURIComponent(type)}/entries/${id}`, { token: await token() });
  return res.data;
}

export type EntryPayload = Partial<{
  title: string;
  slug: string | null;
  summary: string | null;
  body: string | null;
  image_path: string | null;
  status: PublishStatus;
  published_at: string | null;
  sort_order: number;
  faqs: FaqItem[];
  answer_blocks: AnswerBlock[];
  seo: SeoOverride;
  custom_fields: Record<string, unknown>;
}>;

export async function createEntry(type: string, payload: EntryPayload): Promise<AdminEntry> {
  const res = await apiFetch<{ data: AdminEntry }>(`/admin/content-types/${encodeURIComponent(type)}/entries`, {
    method: "POST", body: payload, token: await token(),
  });
  return res.data;
}

export async function updateEntry(type: string, id: number, payload: EntryPayload): Promise<AdminEntry> {
  const res = await apiFetch<{ data: AdminEntry }>(`/admin/content-types/${encodeURIComponent(type)}/entries/${id}`, {
    method: "PATCH", body: payload, token: await token(),
  });
  return res.data;
}

export async function deleteEntry(type: string, id: number): Promise<void> {
  await apiFetch<void>(`/admin/content-types/${encodeURIComponent(type)}/entries/${id}`, { method: "DELETE", token: await token() });
}
