"use client";

import Link from "next/link";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea, Select } from "@/components/ui/input";
import { IconField } from "@/components/admin/icon-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createProductCategoryAction, updateProductCategoryAction, deleteProductCategoryAction,
  type ProductCategoryFormState,
} from "./actions";
import type { AdminProductCategory } from "@/types/api";

const initial: ProductCategoryFormState = {};

/** Three panels; the field lists map a 422 back to the tab holding it. */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "description", "parent_id", "sort_order", "show_in_menu"] },
  { id: "media", label: "Media", fields: ["icon"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function CategoryForm({
  category, parents, saved,
}: {
  category?: AdminProductCategory;
  parents: { id: number; name: string }[];
  saved?: boolean;
}) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateProductCategoryAction : createProductCategoryAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  // A category cannot be its own parent. The server rejects this and every
  // deeper cycle too; removing the obvious case from the list just avoids
  // offering a choice that is guaranteed to fail.
  const parentOptions = parents.filter((p) => p.id !== category?.id);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={category!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Live at <Link className="underline" href={`/products/${category!.slug}`}>/products/{category!.slug}</Link>.
        </Alert>
      )}

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
              hint="Plain text. Shown as the lede on the category page and used as its meta description.">
              <Textarea id="description" name="description" rows={4} defaultValue={category?.description ?? ""} maxLength={2000} />
            </Field>
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Parent category" htmlFor="parent_id" error={err("parent_id")}
              hint="Leave as “Top level” unless this sits inside another category." variant="float-static">
              <Select
                id="parent_id" name="parent_id"
                defaultValue={category?.parent_id ? String(category.parent_id) : ""}
                aria-invalid={Boolean(err("parent_id"))}
              >
                <option value="">Top level</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first in the category grid.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={category?.sort_order ?? 0} />
            </Field>


            {/*
              Separate from status on purpose. Publishing decides whether a page exists;
              this decides whether the mega menu points at it. A catalogue outgrows a
              navigation long before it outgrows itself.
            */}
            <label className="mb-[18px] flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" name="show_in_menu" value="1" className="mt-0.5"
                defaultChecked={category?.show_in_menu ?? true} />
              <span>
                Show in the main menu
                <span className="mt-0.5 block text-[12.5px] text-faint">
                  Unticked, it stays published and listed on the products index &mdash; it just drops out
                  of the header navigation.
                </span>
              </span>
            </label>

            <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-[12.5px] leading-[1.5] text-muted">
              Categories have no draft state — they are the taxonomy the product
              listing and navigation key off. Deleting one keeps its products, and
              moves any child categories up to this one’s parent.
            </p>
          </aside>
        </div>

        <div>
          <IconField defaultValue={category?.icon ?? null} error={err("icon")} />
        </div>

        <SeoPanel seo={category?.seo} defaults={category?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create category"}
        </Button>
        <Link href="/admin/product-categories" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteProductCategoryAction} formNoValidate
              onClick={(e) => {
                const products = category!.product_count ?? 0;
                const children = category!.child_count ?? 0;
                const parts: string[] = [];
                if (products) parts.push(`${products} product${products === 1 ? "" : "s"} will stay in the catalogue but lose this category`);
                if (children) parts.push(`${children} child categor${children === 1 ? "y" : "ies"} will move up a level`);
                const warning = parts.length
                  ? `Delete "${category!.name}"? ${parts.join(", and ")}.`
                  : `Delete "${category!.name}"? This cannot be undone.`;
                if (!window.confirm(warning)) e.preventDefault();
              }}
            >
              Delete category
            </Button>
          </span>
        )}
      </FormActions>
    </form>
  );
}
