"use client";

import Link from "next/link";
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
import {
  createSolutionAction, updateSolutionAction, deleteSolutionAction,
  type SolutionFormState,
} from "./actions";
import type { AdminIndustry, AdminProduct, AdminSolution } from "@/types/api";

const initial: SolutionFormState = {};

export function SolutionForm({
  solution, products, industries, saved,
}: {
  solution?: AdminSolution;
  products: AdminProduct[];
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

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={solution!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          {solution?.status === "published"
            ? <>Live at <Link className="underline" href={`/solutions/${solution.slug}`}>/solutions/{solution.slug}</Link>.</>
            : "Saved as a draft — it is not on the public site yet."}
        </Alert>
      )}

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

          <IconField defaultValue={solution?.icon ?? null} error={err("icon")} />

          <CoverField
            label="Hero image"
            name="hero_image_path"
            defaultPath={solution?.hero_image_path ?? null}
            defaultUrl={solution?.hero_image ?? null}
          />

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
        </aside>
      </div>

      <FaqField defaultValue={solution?.faqs ?? []} error={rowErr("faqs")} />

      <SeoPanel seo={solution?.seo} defaults={solution?.seo_defaults} error={seoErr} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
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
      </div>
    </form>
  );
}
