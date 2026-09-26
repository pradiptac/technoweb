"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import { createEntryAction, deleteEntryAction, updateEntryAction, type EntryFormState } from "./actions";
import type { AdminContentType, AdminEntry, AnswerBlockKindOption, CustomFieldGroupDefinition } from "@/types/api";

const initial: EntryFormState = {};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * An entry of a custom content type, in the Solutions form pattern: Content,
 * Media (when the type has pictures), SEO, AEO, and Fields last when a custom
 * field group is attached to the type.
 *
 * The tab list and the panels are built from one list, because `Tabs` reads
 * its children by position — a Media tab that comes and goes for one type and
 * not another must take its panel with it, or every tab after it shows the
 * wrong panel.
 */
export function EntryForm({
  type, entry, kinds, fieldGroups, saved,
}: {
  type: AdminContentType;
  entry?: AdminEntry;
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the entries index, for a new entry. */
  fieldGroups?: CustomFieldGroupDefinition[];
  saved?: boolean;
}) {
  const editing = Boolean(entry);
  const [state, formAction, pending] = useActionState(editing ? updateEntryAction : createEntryAction, initial);

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  const customGroups = entry?.custom_field_groups ?? fieldGroups ?? [];
  const record = entry ? { type: "entry", id: entry.id } : null;
  const where = `/${type.slug}/${entry?.slug ?? "slug"}`;

  const panels: { tab: TabGroup; node: ReactNode }[] = [
    {
      tab: { id: "content", label: "Content", fields: ["title", "slug", "summary", "body", "status", "published_at", "sort_order"] },
      node: (
        <div key="content" className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={entry?.title} required aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? `This is the URL: ${where}. Changing it leaves a 301 behind automatically.`
                : `Leave blank to build one from the title. It will live at ${where}.`}>
              <Input id="slug" name="slug" defaultValue={entry?.slug} className="font-mono text-14"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="A sentence or two: the archive tile, the page's lede and the meta description.">
              <Textarea id="summary" name="summary" rows={3} maxLength={1000} defaultValue={entry?.summary ?? ""} />
            </Field>

            {type.has_body && <EditorField name="body" defaultValue={entry?.body ?? ""} error={err("body")} />}
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={entry?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Publish date" htmlFor="published_at" error={err("published_at")}
              hint="Blank when publishing sets it to now. A future date holds the entry back until then.">
              <Input id="published_at" name="published_at" type="datetime-local"
                defaultValue={toLocalInput(entry?.published_at ?? null)} />
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint={type.sort === "manual" ? "Lower numbers come first in the archive." : "Used when the archive is ordered by sort order."}>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={entry?.sort_order ?? 0} />
            </Field>
          </aside>
        </div>
      ),
    },
    ...(type.has_image ? [{
      tab: { id: "media", label: "Media", fields: ["image_path"] },
      node: (
        <div key="media">
          <CoverField label="Picture" name="image_path"
            hint="Drawn at the top of the page and on the archive tile, cropped to 1200 x 630."
            defaultPath={entry?.image_path ?? null} defaultUrl={entry?.image ?? null} />
          {err("image_path") && <p className="-mt-3 mb-4 text-12-5 text-err">{err("image_path")}</p>}
        </div>
      ),
    }] : []),
    {
      tab: { id: "seo", label: "SEO", fields: ["seo"] },
      node: <SeoPanel key="seo" seo={entry?.seo} defaults={entry?.seo_defaults} error={seoErr} embedded record={record} />,
    },
    {
      tab: { id: "aeo", label: "AEO", fields: ["answer_blocks", "faqs"] },
      node: (
        <div key="aeo">
          <AeoGeoPanel record={record} blocks={entry?.answer_blocks} />
          <AnswerBlocksField defaultValue={entry?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
          <FaqField defaultValue={entry?.faqs ?? []} error={rowErr("faqs")} />
        </div>
      ),
    },
  ];

  if (customGroups.length > 0) {
    panels.push({
      tab: withFieldsTab([], customGroups)[0],
      node: (
        <CustomFieldsPanel key="fields" groups={customGroups} values={entry?.custom_fields} media={entry?.custom_field_media}
          error={customFieldError(state.fieldErrors)} />
      ),
    });
  }

  const { tabs, jumpTo } = buildFormTabs(panels.map((p) => p.tab), state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      <input type="hidden" name="type" value={type.slug} />
      {editing && <input type="hidden" name="id" value={entry!.id} />}
      {editing && <input type="hidden" name="previous_slug" value={entry!.slug} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {entry?.status === "published" && type.is_active
            ? <>Live at <Link className="underline" href={entry.path}>{entry.path}</Link>.</>
            : "Saved — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        {panels.map((p) => p.node)}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : `Create ${type.name.toLowerCase()}`}
        </Button>
        <Link href={`/admin/content/${type.slug}`} className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteEntryAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${entry!.title}"? ${entry!.path} will start returning 404.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete {type.name.toLowerCase()}
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
