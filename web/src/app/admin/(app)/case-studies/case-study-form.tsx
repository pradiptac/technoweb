"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { ResultsField } from "@/components/admin/results-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { BodyReplacedNote, RecordSectionsPanel, SECTIONS_TAB, useRecordSections } from "../pages/builder/record-sections";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import { CoverField } from "@/components/admin/cover-field";
import {
  createCaseStudyAction, updateCaseStudyAction, deleteCaseStudyAction,
  type CaseStudyFormState,
} from "./actions";
import type { CustomFieldGroupDefinition, AdminCaseStudy, AdminIndustry, PageBuilderOptions } from "@/types/api";

const initial: CaseStudyFormState = {};

/** Three panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "results", "body", "status",
             "industry_id", "client_name"] },
  // Sections in place of the written body (0.129.0) — the choice and the builder.
  SECTIONS_TAB,
  { id: "media", label: "Media", fields: ["cover_image_path"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function CaseStudyForm({
  study, industries, saved, fieldGroups, builder,
}: {
  study?: AdminCaseStudy;
  industries: AdminIndustry[];
  saved?: boolean;
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
  /** `GET /admin/pages/builder` — the section builder's types and pickers, for the Sections tab. */
  builder: PageBuilderOptions;
}) {
  const editing = Boolean(study);
  const [state, formAction, pending] = useActionState(
    editing ? updateCaseStudyAction : createCaseStudyAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  // The body area: the written body, or builder sections (0.129.0).
  const body = useRecordSections(study);

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = study?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  // The API reports per-row problems as results.0.value; surface the first
  // of them against the whole field rather than losing it.
  const resultsErr = err("results")
    ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith("results."))?.[1]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={study!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {study?.status === "published"
            ? <>Live at <Link className="underline" href={`/case-studies/${study.slug}`}>/case-studies/{study.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={study?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={study?.slug} className="font-mono text-14"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="Shown on the case-studies index and used as the meta description when no SEO override is set. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={study?.summary ?? ""}
                maxLength={500} aria-invalid={Boolean(err("summary"))} />
            </Field>

            <ResultsField defaultValue={study?.results ?? []} error={resultsErr} />

            <BodyReplacedNote state={body} />

            <EditorField name="body" defaultValue={study?.body ?? ""} error={err("body")} />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={study?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Industry" htmlFor="industry_id" error={err("industry_id")} variant="float-static">
              <Select id="industry_id" name="industry_id" defaultValue={study?.industry_id ?? ""}>
                <option value="">Not sector specific</option>
                {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>

            <Field label="Client name" htmlFor="client_name" error={err("client_name")}
              hint="Leave blank where the client has not agreed to be named.">
              <Input id="client_name" name="client_name" defaultValue={study?.client_name ?? ""} />
            </Field>
          </aside>
        </div>

        {/* Sections in place of the written body. One child, always mounted. */}
        <RecordSectionsPanel
          state={body}
          builder={builder}
          media={study?.blocks_media ?? {}}
          errors={state.fieldErrors ?? {}}
          bodyField="body"
          storedBody={study?.body ?? ""}
          noun="case study"
        />

        <div>
          <CoverField
            hint="PNG, JPG, GIF or WebP. 1200 x 630 px — the ratio the case study page and its share card both use."
            defaultPath={study?.cover_image_path ?? null}
            defaultUrl={study?.cover_image ?? null}
          />
        </div>

        <SeoPanel seo={study?.seo} defaults={study?.seo_defaults} error={seoErr} embedded record={study ? { type: 'case_study', id: study.id } : null} />

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={study?.custom_fields} media={study?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create case study"}
        </Button>
        <Link href="/admin/case-studies" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteCaseStudyAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${study!.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete case study
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
