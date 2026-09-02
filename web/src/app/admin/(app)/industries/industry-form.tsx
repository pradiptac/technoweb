"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { IconField } from "@/components/admin/icon-field";
import { RelationPicker } from "@/components/admin/relation-picker";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createIndustryAction, updateIndustryAction, deleteIndustryAction, type IndustryFormState,
} from "./actions";
import type { AdminIndustry } from "@/types/api";

const initial: IndustryFormState = {};

/** Four panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "summary", "body", "sort_order", "show_in_menu"] },
  { id: "media", label: "Media", fields: ["icon"] },
  { id: "related", label: "Related", fields: ["solution_ids"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function IndustryForm({
  industry, solutions, saved,
}: {
  industry?: AdminIndustry;
  solutions: { id: number; name: string }[];
  saved?: boolean;
}) {
  const editing = Boolean(industry);
  const [state, formAction, pending] = useActionState(
    editing ? updateIndustryAction : createIndustryAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={industry!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Live at <Link className="underline" href={`/industries/${industry!.slug}`}>/industries/{industry!.slug}</Link>.
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            {/* `name`, not `title` — this model's slug derives from name. */}
            <Field label="Name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" defaultValue={industry?.name} required aria-invalid={Boolean(err("name"))} />
            </Field>
            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the name."}>
              <Input id="slug" name="slug" defaultValue={industry?.slug} className="font-mono text-[14px]" />
            </Field>
            <Field label="Summary" htmlFor="summary" error={err("summary")}
              hint="One line, shown on the industries index and in the header menu. Max 500 characters.">
              <Textarea id="summary" name="summary" rows={3} defaultValue={industry?.summary ?? ""} maxLength={500} />
            </Field>
            <EditorField name="body" defaultValue={industry?.body ?? ""} error={err("body")} />
          </div>
          <aside className="grid content-start gap-0">
            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first on the index and in the menu.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={industry?.sort_order ?? 0} />
            </Field>
            {/*
              Separate from status on purpose. Publishing decides whether a page exists;
              this decides whether the mega menu points at it. A catalogue outgrows a
              navigation long before it outgrows itself.
            */}
            <label className="mb-[18px] flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" name="show_in_menu" value="1" className="mt-0.5"
                defaultChecked={industry?.show_in_menu ?? true} />
              <span>
                Show in the main menu
                <span className="mt-0.5 block text-[12.5px] text-faint">
                  Unticked, it stays published and listed on the industries index &mdash; it just drops out
                  of the header navigation.
                </span>
              </span>
            </label>

            <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-[12.5px] leading-[1.5] text-muted">
              Industries have no draft state — every one is live. They are a fixed
              taxonomy the navigation and case studies both key off, so deleting is
              the only way to remove one.
            </p>
          </aside>
        </div>

        <div>
          <IconField defaultValue={industry?.icon ?? null} error={err("icon")} />
        </div>

        <div>
          <RelationPicker
            name="solution_ids"
            label="Solutions we lead with"
            hint="Shown on the sector page as the practice areas to open with."
            options={solutions}
            defaultValue={industry?.solution_ids ?? []}
            error={rowErr("solution_ids")}
          />
        </div>

        <SeoPanel seo={industry?.seo} defaults={industry?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create industry"}
        </Button>
        <Link href="/admin/industries" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteIndustryAction} formNoValidate
              onClick={(e) => {
                const n = industry!.case_study_count ?? 0;
                const warning = n
                  ? `Delete "${industry!.name}"? ${n} case ${n === 1 ? "study" : "studies"} will lose its sector, though they will stay published.`
                  : `Delete "${industry!.name}"? This cannot be undone.`;
                if (!window.confirm(warning)) e.preventDefault();
              }}
            >
              Delete industry
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
