"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getToken } from "@/lib/admin-auth";
import {
  activateDetailTemplate, createDetailTemplate, deactivateDetailTemplate, deleteDetailTemplate, getDetailTemplate,
  getDetailTemplateOptions, getTemplateRecords, previewDetailTemplate, updateDetailTemplate,
  type TemplateRecordOption,
} from "@/lib/admin";
import { keepPreviewDraft } from "@/lib/admin/preview-drafts";
import { str } from "@/lib/admin-form";
import type { AdminDetailTemplate, PageSection, StoredSection } from "@/types/api";

/**
 * Detail templates' writes (0.161.0, docs/page-builder.md "Detail templates").
 *
 * Every write that can change what a public page shows purges the kind's
 * collection tag — the API names it (`cache_tag`) on every template it sends,
 * so no tag is listed here. A save purges even while the template is off: the
 * edit is cheap to miss and expensive to explain. A refusal comes back as a
 * sentence and the API's field errors, keyed `blocks.N.data.field` like a
 * page's, because the builder calls these from buttons.
 */
export type TemplateResult = { ok: boolean; id?: number; error?: string; fieldErrors?: Record<string, string[]>; template?: AdminDetailTemplate };
export type NewTemplateState = { error?: string; fieldErrors?: Record<string, string[]> };

function fail(error: unknown): TemplateResult {
  if (error instanceof ApiError) {
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { ok: false, error: "Your account cannot lay out this kind of page." };
    if (error.status === 422) return { ok: false, error: error.message || "Check the highlighted fields.", fieldErrors: error.errors };
  }
  return { ok: false, error: "We could not reach the API. Try again shortly." };
}

function purge(template: Pick<AdminDetailTemplate, "cache_tag">) {
  if (template.cache_tag) updateTag(template.cache_tag);
  revalidatePath("/admin/detail-templates");
}

/** A new template, seeded with today's layout or with the body alone, then straight on to its editor. */
export async function createTemplateAction(_prev: NewTemplateState, formData: FormData): Promise<NewTemplateState> {
  const type = str(formData, "type") ?? "";
  const name = (str(formData, "name") ?? "").trim();
  const start = str(formData, "start") === "body" ? "body" : "today";

  let id: number;
  try {
    const options = await getDetailTemplateOptions();
    const kind = options.detail_templates?.types.find((t) => t.value === type);
    if (!kind) return { error: "Choose the kind of page this template is for.", fieldErrors: { type: ["Choose a kind of page."] } };

    // The blocks in the order the page draws them today — the API's list — or the body alone.
    const order = start === "today" ? kind.today : [options.detail_templates!.required_block];
    const blocks: StoredSection[] = order.map((block) => ({ id: crypto.randomUUID(), type: block, hidden: false, background: null, data: {} }));

    const created = await createDetailTemplate({ type, name, blocks });
    id = created.id;
  } catch (error) {
    const result = fail(error);
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath("/admin/detail-templates");
  redirect(`/admin/detail-templates/${id}`);
}

export async function saveTemplateAction(id: number, payload: { name: string; blocks: StoredSection[] }): Promise<TemplateResult> {
  try {
    const template = await updateDetailTemplate(id, payload);
    purge(template);
    return { ok: true, id, template };
  } catch (error) {
    return fail(error);
  }
}

export async function activateTemplateAction(id: number): Promise<TemplateResult> {
  try {
    const template = await activateDetailTemplate(id);
    purge(template);
    return { ok: true, id, template };
  } catch (error) {
    return fail(error);
  }
}

export async function deactivateTemplateAction(id: number): Promise<TemplateResult> {
  try {
    const template = await deactivateDetailTemplate(id);
    purge(template);
    return { ok: true, id, template };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteTemplateAction(id: number): Promise<TemplateResult> {
  try {
    // Read first: the tag belongs to the kind, and the row is gone after the delete.
    const template = await getDetailTemplate(id);
    await deleteDetailTemplate(id);
    purge(template);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** The records of one kind for the preview's picker — the first fifty, or those matching a search. */
export async function templateRecordsAction(type: string, q: string): Promise<TemplateRecordOption[]> {
  try {
    return await getTemplateRecords(type, q.trim());
  } catch {
    return [];
  }
}

export type TemplatePreviewResult = { id?: string; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * The unsaved preview: the blocks as typed go to `POST /admin/detail-templates/preview`,
 * which runs the rules a save runs around the chosen record and writes nothing;
 * the record's read and the presented stack are kept for ten minutes
 * (`keepPreviewDraft`) and the dialog frames `/admin/draft-preview/{id}`, which
 * draws the kind's own template view — the very components the public page
 * uses, with this record.
 */
export async function previewTemplateAction(type: string, recordId: number, json: string): Promise<TemplatePreviewResult> {
  let blocks: StoredSection[];
  try {
    const parsed = JSON.parse(json);
    blocks = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "The template could not be read." };
  }

  const session = await getToken();
  if (!session) redirect("/admin/login");

  try {
    const read = await previewDetailTemplate(type, recordId, blocks);

    return { id: keepPreviewDraft(session, read.detail_template.sections as PageSection[], { type: read.type, record: read.record }) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 403) return { error: "Your account cannot preview this kind of page." };
      if (error.status === 422) return { error: error.errors ? "Some parts need attention before the template can be shown." : (error.message || "That record could not be previewed."), fieldErrors: error.errors };
    }
    return { error: "The preview could not be drawn. Try again shortly." };
  }
}
