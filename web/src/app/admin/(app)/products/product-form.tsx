"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { GalleryField } from "@/components/admin/gallery-field";
import { RelationPicker } from "@/components/admin/relation-picker";
import { SeoPanel } from "@/components/admin/seo-panel";
import { SpecField } from "@/components/admin/spec-field";
import { StringListField } from "@/components/admin/string-list-field";
import {
  createProductAction, updateProductAction, deleteProductAction, type ProductFormState,
} from "./actions";
import type { AdminProduct, PickerOption } from "@/types/api";

const initial: ProductFormState = {};

export function ProductForm({
  product, brands, categories, solutions, products, saved,
}: {
  product?: AdminProduct;
  brands: PickerOption[];
  categories: PickerOption[];
  solutions: PickerOption[];
  products: PickerOption[];
  saved?: boolean;
}) {
  const editing = Boolean(product);
  const [state, formAction, pending] = useActionState(
    editing ? updateProductAction : createProductAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // A product cannot be related to itself; the server refuses it too.
  const relatable = products.filter((p) => p.id !== product?.id);

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={product!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Live at <Link className="underline" href={`/products/${product!.slug}`}>/products/{product!.slug}</Link>.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")}
            hint="Just the model — the brand is shown alongside it, so no need to repeat it here.">
            <Input id="name" name="name" defaultValue={product?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint={editing
              ? "Changing this leaves a 301 behind automatically, so old links keep working."
              : "Leave blank to build one from the name."}>
            <Input id="slug" name="slug" defaultValue={product?.slug} className="font-mono text-[14px]" />
          </Field>

          <Field label="SKU" htmlFor="sku" error={err("sku")}
            hint="The manufacturer part number, shown on the product page.">
            <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} className="font-mono text-[14px]" />
          </Field>

          <Field label="Short description" htmlFor="short_description" error={err("short_description")}
            hint="One line, used on catalogue cards and as the search-result description. Plain text, max 500 characters.">
            <Textarea id="short_description" name="short_description" rows={3}
              defaultValue={product?.short_description ?? ""} maxLength={500} />
          </Field>

          <EditorField name="description" label="Description"
            defaultValue={product?.description ?? ""} error={err("description")} />

          <SpecField defaultValue={product?.specifications ?? {}} error={rowErr("specifications")} />

          <StringListField
            name="features"
            label="Features"
            hint="The bullet list under the spec table."
            defaultValue={product?.features ?? []}
            error={rowErr("features")}
          />

          <FaqField defaultValue={product?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Status" htmlFor="status" error={err("status")}>
            <select
              id="status" name="status" defaultValue={product?.status ?? "draft"}
              className="w-full rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </Field>

          <Field label="Brand" htmlFor="brand_id" error={err("brand_id")}>
            <select
              id="brand_id" name="brand_id" defaultValue={product?.brand_id ? String(product.brand_id) : ""}
              className="w-full rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="">No brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>

          <Field label="Category" htmlFor="product_category_id" error={err("product_category_id")}
            hint="Decides which /products/… listing this appears on.">
            <select
              id="product_category_id" name="product_category_id"
              defaultValue={product?.product_category_id ? String(product.product_category_id) : ""}
              className="w-full rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <GalleryField
            defaultPaths={product?.images ?? []}
            defaultUrls={product?.image_urls ?? []}
            error={rowErr("images")}
          />

          <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
            hint="Lower numbers come first within a category.">
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={product?.sort_order ?? 0} />
          </Field>

          <Field label="Featured" htmlFor="is_featured" hint="Featured products lead the catalogue.">
            <select
              id="is_featured" name="is_featured" defaultValue={product?.is_featured ? "1" : "0"}
              className="w-full rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </Field>

          <RelationPicker
            name="solution_ids"
            label="Solutions"
            hint="Solutions this hardware is part of. Shown on those pages."
            options={solutions}
            defaultValue={product?.solution_ids ?? []}
            error={rowErr("solution_ids")}
          />

          <RelationPicker
            name="related_product_ids"
            label="Related products"
            hint="Shown at the foot of the product page. One-way — picking one here does not list this product on theirs."
            options={relatable}
            defaultValue={product?.related_product_ids ?? []}
            error={rowErr("related_product_ids")}
          />
        </aside>
      </div>

      <SeoPanel seo={product?.seo} defaults={product?.seo_defaults} error={seoErr} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
        </Button>
        <Link href="/admin/products" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteProductAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(
                  `Delete "${product!.name}"? It comes off the site immediately. The slug is freed, so a replacement can reuse it.`,
                )) e.preventDefault();
              }}
            >
              Delete product
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
