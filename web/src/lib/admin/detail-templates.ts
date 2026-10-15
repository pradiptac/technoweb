import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { AdminDetailTemplate, PageBuilderOptions, Paginated, StoredSection } from "@/types/api";

/**
 * Detail-page templates (0.161.0, `docs/page-builder.md` "Detail templates").
 * The API narrows every call to the role that owns the kind of record — a
 * content manager's call for a shop product's template answers 403 — so a
 * screen needs no list of who may.
 */
export type DetailTemplatePayload = { type?: string; name?: string; blocks?: StoredSection[] };

/** A record of one kind, for the preview's picker. */
export type TemplateRecordOption = { id: number; title: string; slug: string | null };

/** What the preview draws the unsaved template around: the record's public read, and the template as typed. */
export type TemplatePreviewRead = {
  type: string;
  record: Record<string, unknown>;
  detail_template: { id: number; sections: import("@/types/api").PageSection[] };
};

export async function getDetailTemplates(params: { type?: string; per_page?: number } = {}): Promise<Paginated<AdminDetailTemplate>> {
  return apiFetch<Paginated<AdminDetailTemplate>>(`/admin/detail-templates${query(params)}`, { token: await token() });
}

export async function getDetailTemplate(id: number): Promise<AdminDetailTemplate> {
  const res = await apiFetch<{ data: AdminDetailTemplate }>(`/admin/detail-templates/${id}`, { token: await token() });
  return res.data;
}

/** The page builder's options plus `detail_templates`: the kinds this account may lay out and the blocks each may place. */
export async function getDetailTemplateOptions(): Promise<PageBuilderOptions> {
  const res = await apiFetch<{ data: PageBuilderOptions }>("/admin/detail-templates/options", { token: await token() });
  return res.data;
}

export async function getTemplateRecords(type: string, q = ""): Promise<TemplateRecordOption[]> {
  const res = await apiFetch<{ data: TemplateRecordOption[] }>(`/admin/detail-templates/records${query({ type, q: q || undefined })}`, { token: await token() });
  return res.data;
}

export async function createDetailTemplate(payload: DetailTemplatePayload): Promise<AdminDetailTemplate> {
  const res = await apiFetch<{ data: AdminDetailTemplate }>("/admin/detail-templates", { method: "POST", body: payload, token: await token() });
  return res.data;
}

export async function updateDetailTemplate(id: number, payload: DetailTemplatePayload): Promise<AdminDetailTemplate> {
  const res = await apiFetch<{ data: AdminDetailTemplate }>(`/admin/detail-templates/${id}`, { method: "PATCH", body: payload, token: await token() });
  return res.data;
}

export async function deleteDetailTemplate(id: number): Promise<void> {
  await apiFetch<void>(`/admin/detail-templates/${id}`, { method: "DELETE", token: await token() });
}

export async function activateDetailTemplate(id: number): Promise<AdminDetailTemplate> {
  const res = await apiFetch<{ data: AdminDetailTemplate }>(`/admin/detail-templates/${id}/activate`, { method: "POST", token: await token() });
  return res.data;
}

export async function deactivateDetailTemplate(id: number): Promise<AdminDetailTemplate> {
  const res = await apiFetch<{ data: AdminDetailTemplate }>(`/admin/detail-templates/${id}/deactivate`, { method: "POST", token: await token() });
  return res.data;
}

/** The unsaved preview: the blocks as typed, validated as a save is, around one record. Writes nothing. */
export async function previewDetailTemplate(type: string, recordId: number, blocks: StoredSection[]): Promise<TemplatePreviewRead> {
  const res = await apiFetch<{ data: TemplatePreviewRead }>("/admin/detail-templates/preview", {
    method: "POST", body: { type, record_id: recordId, blocks }, token: await token(),
  });
  return res.data;
}
