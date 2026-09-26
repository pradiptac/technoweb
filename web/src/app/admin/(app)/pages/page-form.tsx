"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import { createPageAction, updatePageAction, deletePageAction, type PageFormState } from "./actions";
import type { CustomFieldGroupDefinition, AdminPage, AnswerBlockKindOption } from "@/types/api";

const initial: PageFormState = {};

/** Two panels: the page, and the overrides almost nobody touches. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "body", "status", "published_at", "template"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
  // The AEO tab (docs/aeo-geo-contract.md §7). Last, so every tab above keeps its place.
  { id: "aeo", label: "AEO", fields: ["answer_blocks"] },
];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PageForm({
  page, saved, kinds, fieldGroups,
}: {
  page?: AdminPage;
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
}) {
  const editing = Boolean(page);
  const [state, formAction, pending] = useActionState(
    editing ? updatePageAction : createPageAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  /** Per-row errors arrive as e.g. answer_blocks.0.answer; surface the first. */
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = page?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={page!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {page?.status === "published"
            ? <>Live at <Link className="underline" href={`/${page.slug}`}>/{page.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={page?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "This is the URL: /slug. Changing it leaves a 301 behind automatically."
                : "Leave blank to build one from the title. The page will live at /slug."}>
              <Input id="slug" name="slug" defaultValue={page?.slug} className="font-mono text-14"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <EditorField name="body" defaultValue={page?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={page?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Publish date" htmlFor="published_at" error={err("published_at")}
              hint="Leave blank when publishing and it is set to now.">
              <Input id="published_at" name="published_at" type="datetime-local"
                defaultValue={toLocalInput(page?.published_at ?? null)} />
            </Field>

            <Field label="Template" htmlFor="template" error={err("template")}
              variant="float-static"
              hint="Wide drops the reading-width cap — use it for a page built around a slider or gallery.">
              <Select id="template" name="template" defaultValue={page?.template ?? "default"}>
                <option value="default">Default — text width</option>
                <option value="wide">Wide — full container</option>
              </Select>
            </Field>
          </aside>
        </div>

        <SeoPanel seo={page?.seo} defaults={page?.seo_defaults} error={seoErr} embedded record={page ? { type: 'page', id: page.id } : null} />

        {/*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them. See docs/aeo-geo-contract.md §7.
        */}
        <div>
          <AeoGeoPanel record={page ? { type: 'page', id: page.id } : null} blocks={page?.answer_blocks} />
          <AnswerBlocksField defaultValue={page?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        </div>

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={page?.custom_fields} media={page?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create page"}
        </Button>
        <Link href="/admin/pages" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deletePageAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${page!.title}"? /${page!.slug} will start returning 404.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete page
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
