"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createStoreCategoryAction, deleteStoreCategoryAction, updateStoreCategoryAction, type StoreFormState,
} from "../actions";
import type { AdminStoreCategory } from "@/types/api";

const initial: StoreFormState = {};

/**
 * Two panels now, not one pane.
 *
 * This used to carry a comment arguing the opposite -- "a category is a label
 * on a listing, not a page" -- which was the same claim `Store\CategoryRequest`
 * made in PHP, and both were wrong for the same reason: `/store/categories/
 * {slug}` is a real route with its own canonical, carried in the sitemap since
 * the store shipped. `ProductCategory`'s form is the template: the dividing
 * line this console uses is "does the record have a SeoPanel", and a category
 * that publishes a page has one.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "description", "image_path", "is_active", "sort_order"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function StoreCategoryForm({ category }: { category?: AdminStoreCategory }) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateStoreCategoryAction : createStoreCategoryAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={category!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {/*
        One child per tab -- `Tabs` reads `children[i]` positionally, so a
        third top-level sibling here would be mounted nowhere at all rather
        than merely hidden. Each panel is therefore a single wrapping element,
        never loose fields dropped straight inside `<Tabs>`.
      */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Name" htmlFor="name" error={err("name")}>
              <Input id="name" name="name" defaultValue={category?.name} required aria-invalid={Boolean(err("name"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the name."}>
              <Input id="slug" name="slug" defaultValue={category?.slug} className="font-mono text-[14px]" />
            </Field>

            <Field label="Description" htmlFor="description" error={err("description")}
              hint="A line under the heading on the category page. Plain text.">
              <Textarea id="description" name="description" rows={3} defaultValue={category?.description ?? ""} maxLength={1000} />
            </Field>

            <CoverField
              name="image_path"
              label="Image"
              hint="PNG, JPG, GIF or WebP. Around 1200 x 800 px."
              defaultPath={category?.image_path ?? null}
              defaultUrl={category?.image_url ?? null}
            />
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Shown in the shop" htmlFor="is_active" variant="float-static"
              hint="A category with nothing published in it is hidden regardless — an empty filter reads as “they do not sell this”.">
              <Select id="is_active" name="is_active" defaultValue={category?.is_active === false ? "0" : "1"}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={category?.sort_order ?? 0} />
            </Field>
          </aside>
        </div>

        <SeoPanel seo={category?.seo ?? undefined} defaults={category?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create category"}
        </Button>
        <Link href="/admin/store/categories"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteStoreCategoryAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(
                  `Delete "${category!.name}"? The products in it stay on sale and become uncategorised.`,
                )) e.preventDefault();
              }}
            >
              Delete category
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
