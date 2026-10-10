"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { IconField } from "@/components/admin/icon-field-lazy";
import { RelationPicker } from "@/components/admin/relation-picker";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { StringListField } from "@/components/admin/string-list-field";
import { Tabs } from "@/components/admin/tabs";
import { BodyReplacedNote, RecordSectionsPanel, SECTIONS_TAB, useRecordSections } from "../pages/builder/record-sections";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import {
  createSolutionAction, updateSolutionAction, deleteSolutionAction,
  type SolutionFormState,
} from "./actions";
import type { CustomFieldGroupDefinition, AdminIndustry, PickerOption, AdminSolution, AnswerBlockKindOption, PageBuilderOptions } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: SolutionFormState = {};

/**
 * Four panels rather than one 1,972px scroll. The field lists are what map a
 * 422 back to the tab holding it — see buildFormTabs.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "problem_statement", "overview",
             "benefits", "technologies", "status", "sort_order", "show_in_menu"] },
  // Sections in place of the written body (0.129.0) — the choice and the builder.
  SECTIONS_TAB,
  { id: "media", label: "Media", fields: ["icon", "hero_image_path"] },
  { id: "related", label: "Related", fields: ["product_ids", "industry_ids", "faqs"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
  // The AEO tab (docs/aeo-geo-contract.md §7). Last, so every tab above keeps its place.
  { id: "aeo", label: "AEO", fields: ["answer_blocks"] },
];

export function SolutionForm({
  solution, products, industries, saved, kinds, fieldGroups, builder,
}: {
  solution?: AdminSolution;
  products: PickerOption[];
  industries: AdminIndustry[];
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
  /** `GET /admin/pages/builder` — the section builder's types and pickers, for the Sections tab. */
  builder: PageBuilderOptions;
}) {
  const editing = Boolean(solution);
  const [state, formAction, pending] = useActionState(
    editing ? updateSolutionAction : createSolutionAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  /** Per-row errors arrive as e.g. faqs.0.question; surface the first. */
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {})
      .find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // The body area: the written body, or builder sections (0.129.0).
  const body = useRecordSections(solution);

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = solution?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={solution!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {solution?.status === "published"
            ? <>Live at <Link className="underline" href={`/solutions/${solution.slug}`}>/solutions/{solution.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Title" htmlFor="title" error={err("title")}>
              <Input id="title" name="title" defaultValue={solution?.title} required
                aria-invalid={Boolean(err("title"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the title."}>
              <Input id="slug" name="slug" defaultValue={solution?.slug} className="font-mono text-14"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One or two sentences, shown on the solutions index and as the meta description. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={solution?.summary ?? ""}
                maxLength={500} aria-invalid={Boolean(err("summary"))} />
            </Field>

            <BodyReplacedNote state={body} kept="The problem statement, overview and benefits below are kept, and come back if the layout is switched." />

            <Field label="Problem statement" htmlFor="problem_statement" error={err("problem_statement")}
              hint="The situation this solves, in the customer's words. Plain prose — it renders as a lede, not rich text.">
              <Textarea id="problem_statement" name="problem_statement" rows={4}
                defaultValue={solution?.problem_statement ?? ""}
                aria-invalid={Boolean(err("problem_statement"))} />
            </Field>

            <EditorField name="overview" label="Overview" defaultValue={solution?.overview ?? ""} error={err("overview")} />

            <StringListField
              name="benefits"
              label="Benefits"
              hint="What the customer actually gets. One per row."
              placeholder="A network diagram that matches reality"
              defaultValue={solution?.benefits ?? []}
              error={rowErr("benefits")}
            />

            <StringListField
              name="technologies"
              label="Technologies"
              hint="Vendors, standards and protocols — shown as tags."
              placeholder="Cisco Catalyst"
              defaultValue={solution?.technologies ?? []}
              error={rowErr("technologies")}
            />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={solution?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first on the solutions index.">
              <Input id="sort_order" name="sort_order" type="number" min={0}
                defaultValue={solution?.sort_order ?? 0} />
            </Field>


            {/*
              Separate from status on purpose. Publishing decides whether a page exists;
              this decides whether the mega menu points at it. A catalogue outgrows a
              navigation long before it outgrows itself.
            */}
            <RecordSwitch className="mb-[18px]" name="show_in_menu" defaultChecked={solution?.show_in_menu ?? true} label="Show in the main menu"
              hint="Switched off, it stays published and listed on the solutions index and just drops out of the header navigation." />
          </aside>
        </div>

        {/* Sections in place of the written body. One child, always mounted. */}
        <RecordSectionsPanel
          state={body}
          builder={builder}
          media={solution?.blocks_media ?? {}}
          errors={state.fieldErrors ?? {}}
          bodyField="overview"
          storedBody={solution?.overview ?? ""}
          noun="solution"
        />

        <div className="grid gap-x-8 md:grid-cols-2">
          <IconField defaultValue={solution?.icon ?? null} error={err("icon")} />

          <CoverField
            label="Hero image"
            name="hero_image_path"
            hint="PNG, JPG, GIF or WebP. A landscape image around 1600 x 900 px."
            defaultPath={solution?.hero_image_path ?? null}
            defaultUrl={solution?.hero_image ?? null}
          />
        </div>

        <div>
          <div className="grid gap-x-8 md:grid-cols-2">
            <RelationPicker
              name="product_ids"
              label="Related hardware"
              hint="Products shown as the kit this solution is built from."
              options={products}
              defaultValue={solution?.product_ids ?? []}
              error={rowErr("product_ids")}
            />

            <RelationPicker
              name="industry_ids"
              label="Industries"
              hint="Sectors this solution is led with."
              options={industries}
              defaultValue={solution?.industry_ids ?? []}
              error={rowErr("industry_ids")}
            />
          </div>

          <FaqField defaultValue={solution?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        <SeoPanel seo={solution?.seo} defaults={solution?.seo_defaults} error={seoErr} embedded record={solution ? { type: 'solution', id: solution.id } : null} />

        {/*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them. See docs/aeo-geo-contract.md §7.
        */}
        <div>
          <AeoGeoPanel record={solution ? { type: 'solution', id: solution.id } : null} blocks={solution?.answer_blocks} />
          <AnswerBlocksField defaultValue={solution?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        </div>

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={solution?.custom_fields} media={solution?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create solution"}
        </Button>
        <Link href="/admin/solutions" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              formAction={deleteSolutionAction}
              formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete "${solution!.title}"? This cannot be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              Delete solution
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
