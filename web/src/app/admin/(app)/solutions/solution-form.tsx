"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { IconField } from "@/components/admin/icon-field";
import { RelationPicker } from "@/components/admin/relation-picker";
import { SeoPanel } from "@/components/admin/seo-panel";
import { StringListField } from "@/components/admin/string-list-field";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createSolutionAction, updateSolutionAction, deleteSolutionAction,
  type SolutionFormState,
} from "./actions";
import type { AdminIndustry, PickerOption, AdminSolution } from "@/types/api";

const initial: SolutionFormState = {};

/**
 * Four panels rather than one 1,972px scroll. The field lists are what map a
 * 422 back to the tab holding it — see buildFormTabs.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["title", "slug", "summary", "problem_statement", "overview",
             "benefits", "technologies", "status", "sort_order", "show_in_menu"] },
  { id: "media", label: "Media", fields: ["icon", "hero_image_path"] },
  { id: "related", label: "Related", fields: ["product_ids", "industry_ids", "faqs"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function SolutionForm({
  solution, products, industries, saved,
}: {
  solution?: AdminSolution;
  products: PickerOption[];
  industries: AdminIndustry[];
  saved?: boolean;
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

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
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
              <Input id="slug" name="slug" defaultValue={solution?.slug} className="font-mono text-[14px]"
                aria-invalid={Boolean(err("slug"))} />
            </Field>

            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One or two sentences, shown on the solutions index and as the meta description. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={solution?.summary ?? ""}
                maxLength={500} aria-invalid={Boolean(err("summary"))} />
            </Field>

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
            <label className="mb-[18px] flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" name="show_in_menu" value="1" className="mt-0.5"
                defaultChecked={solution?.show_in_menu ?? true} />
              <span>
                Show in the main menu
                <span className="mt-0.5 block text-[12.5px] text-faint">
                  Unticked, it stays published and listed on the solutions index &mdash; it just drops out
                  of the header navigation.
                </span>
              </span>
            </label>
          </aside>
        </div>

        <div className="grid gap-x-8 md:grid-cols-2">
          <IconField defaultValue={solution?.icon ?? null} error={err("icon")} />

          <CoverField
            label="Hero image"
            name="hero_image_path"
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

        <SeoPanel seo={solution?.seo} defaults={solution?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create solution"}
        </Button>
        <Link href="/admin/solutions" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
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
