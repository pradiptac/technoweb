"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState, useEffect, useRef, useState } from "react";
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
import { SectionBuilder } from "./builder/section-builder";
import { REVISION_LOAD_EVENT, type RevisionLoad } from "@/lib/revisions";
import type { CustomFieldGroupDefinition, AdminPage, AnswerBlockKindOption, PageBuilderOptions, StoredSection } from "@/types/api";

const initial: PageFormState = {};

/** Two panels: the page, and the overrides almost nobody touches. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "body", "status", "published_at", "template"] },
  // The section builder (docs/page-builder.md). In the list whatever the
  // template, so a 422 on `blocks.3.data.heading` always has a tab to land
  // on; drawn only while the template is Builder.
  { id: "builder", label: "Builder", fields: ["blocks"] },
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
  page, saved, kinds, builder, fieldGroups,
}: {
  page?: AdminPage;
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `GET /admin/pages/builder` — the section builder's types, presets and pickers. */
  builder: PageBuilderOptions;
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
  const { tabs: allTabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  /*
    The template decides whether the page is its body or its sections, so it
    is controlled here: the Builder tab is drawn only for `builder`, and the
    body editor steps aside (still mounted, still posted — switching back
    loses nothing). The sections live in this component rather than in the
    tab so a tab that is not drawn cannot take them with it; they post as one
    hidden JSON input.
  */
  const [template, setTemplate] = useState(page?.template ?? "default");
  const isBuilder = template === "builder";
  const [sections, setSections] = useState<StoredSection[]>(page?.blocks ?? []);
  const sectionsInput = useRef<HTMLInputElement>(null);
  // Picture URLs of a version loaded from the page's history, beside the ones the page itself came with.
  const [loadedMedia, setLoadedMedia] = useState<Record<string, string>>({});
  const tabs = isBuilder ? allTabs : allTabs.filter((t) => t.id !== "builder");
  // The body as it stands in the editor (uncontrolled), for the builder's "This page's content".
  // On the server — the builder renders there too — it is the stored body.
  const readBody = () => {
    if (typeof document === "undefined") return page?.body ?? "";
    const field = sectionsInput.current?.closest("form")?.elements.namedItem("body");
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : page?.body ?? "";
  };

  // A structural change — add, move, hide, remove — fires no input event of
  // its own, so the draft keeper and the leave guard are told here.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    sectionsInput.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [sections]);

  // `FormDraft` writes a restored draft into the hidden input; read it back.
  useEffect(() => {
    const input = sectionsInput.current;
    const form = input?.closest("form");
    if (!input || !form) return;
    const restored = () => {
      try {
        const parsed = JSON.parse(input.value);
        if (Array.isArray(parsed)) setSections(parsed as StoredSection[]);
      } catch { /* not ours to fix */ }
    };
    form.addEventListener("tw:draft-restored", restored);
    return () => form.removeEventListener("tw:draft-restored", restored);
  }, []);

  // A version from the history dialog brings the URLs of its pictures; the values themselves go in through FormDraft.
  useEffect(() => {
    const onLoad = (event: Event) => {
      const detail = (event as CustomEvent<RevisionLoad>).detail;
      if (detail?.type === "page") setLoadedMedia((prev) => ({ ...prev, ...detail.media }));
    };
    document.addEventListener(REVISION_LOAD_EVENT, onLoad);
    return () => document.removeEventListener(REVISION_LOAD_EVENT, onLoad);
  }, []);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={page!.id} />}
      <input ref={sectionsInput} type="hidden" name="blocks" value={JSON.stringify(sections)} />

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {page?.status === "published"
            ? <>Live at <Link className="underline" href={`/${page.slug}`}>/{page.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>{[
        <div key="content" className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
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

            {isBuilder && (
              <p className="mb-[18px] rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-13-5 text-muted">
                This page is built from sections — see the <strong>Builder</strong> tab. The body below is kept, and
                comes back if the template is switched.
                {sections.length === 0 && " Its content can be laid out as sections from there in one press."}
              </p>
            )}
            <div hidden={isBuilder}>
              <EditorField name="body" defaultValue={page?.body ?? ""} error={err("body")} />
            </div>
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
              hint="Wide drops the reading-width cap — use it for a page built around a slider or gallery. Builder lays the page out as sections.">
              <Select id="template" name="template" value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="default">Default — text width</option>
                <option value="wide">Wide — full container</option>
                <option value="builder">Builder — sections</option>
              </Select>
            </Field>
          </aside>
        </div>,

        ...(isBuilder ? [
          <SectionBuilder
            key="builder"
            sections={sections}
            setSections={setSections}
            options={builder}
            media={{ ...(page?.blocks_media ?? {}), ...loadedMedia }}
            errors={state.fieldErrors ?? {}}
            pageId={page?.id ?? null}
            readBody={readBody}
          />,
        ] : []),

        <SeoPanel key="seo" seo={page?.seo} defaults={page?.seo_defaults} error={seoErr} embedded record={page ? { type: 'page', id: page.id } : null} />,

        /*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them. See docs/aeo-geo-contract.md §7.
        */
        <div key="aeo">
          <AeoGeoPanel record={page ? { type: 'page', id: page.id } : null} blocks={page?.answer_blocks} />
          <AnswerBlocksField defaultValue={page?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        </div>,

        /* The Fields tab — last, and only when a custom field group applies. */
        ...(customGroups.length > 0 ? [
          <CustomFieldsPanel key="fields" groups={customGroups} values={page?.custom_fields} media={page?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />,
        ] : []),
      ]}</Tabs>

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
