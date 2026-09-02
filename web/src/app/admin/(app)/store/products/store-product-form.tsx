"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useState } from "react";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { DocumentField } from "@/components/admin/document-field";
import { GalleryField } from "@/components/admin/gallery-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { SpecField } from "@/components/admin/spec-field";
import { StringListField } from "@/components/admin/string-list-field";
import { VariationField } from "@/components/admin/variation-field";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { paiseToRupeeInput } from "@/lib/money";
import {
  createStoreProductAction, deleteStoreProductAction, updateStoreProductAction, type StoreFormState,
} from "../actions";
import type { AdminStoreCategory, AdminStoreProduct, PickerOption } from "@/types/api";

const initial: StoreFormState = {};

/**
 * Four panels, and Selling is its own rather than a corner of Content.
 *
 * Price, stock and returnability are the fields that decide what somebody is
 * charged and what they are promised, and they are edited on a different
 * occasion from the copy — a price changes weekly and a description does not.
 *
 * The field lists map a 422 back to the tab holding it. **A new field must be
 * added to its tab's list**, or its error is silently charged to the first tab
 * and an editor sees "could not save" over a form where everything visible
 * looks fine.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "sku", "type", "short_description", "description",
             "specifications", "features", "status", "store_category_id", "brand_id",
             "sort_order", "is_featured"] },
  { id: "selling", label: "Selling",
    fields: ["price_paise", "compare_at_paise", "track_stock", "stock", "returnable", "variations"] },
  /*
    Always present, never conditional on the type.

    `Tabs` takes one child per group in order, so a tab that appears and
    disappears with a select is an array whose length has to be kept in step
    with another array at render time - and a mismatch there is silent, showing
    one panel's content under another's heading. The panel says who it applies
    to instead, which is also the answer to somebody wondering where the field
    went.
  */
  { id: "activation", label: "Activation", fields: ["activation_procedure", "activation_pdf_path"] },
  { id: "media", label: "Media", fields: ["images"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
];

export function StoreProductForm({
  product, categories, brands, saved,
}: {
  product?: AdminStoreProduct;
  categories: AdminStoreCategory[];
  brands: PickerOption[];
  saved?: boolean;
}) {
  const editing = Boolean(product);
  const [state, formAction, pending] = useActionState(
    editing ? updateStoreProductAction : createStoreProductAction, initial,
  );

  /*
    The price is held in state for one reason: the variations panel says
    "blank means ₹11,800", and it has to say the price being typed rather than
    the price that was stored when the page loaded.
  */
  const [price, setPrice] = useState(paiseToRupeeInput(product?.price_paise));
  const [trackStock, setTrackStock] = useState(product?.track_stock ?? true);
  const [type, setType] = useState(product?.type ?? "physical");

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={product!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Live at{" "}
          <Link className="underline" href={`/store/products/${product!.slug}`}>
            /store/products/{product!.slug}
          </Link>.
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Name" htmlFor="name" error={err("name")}
              hint="What it is called on the shelf. The brand is shown alongside, so no need to repeat it.">
              <Input id="name" name="name" defaultValue={product?.name} required aria-invalid={Boolean(err("name"))} />
            </Field>

            <Field label="Slug" htmlFor="slug" error={err("slug")}
              hint={editing
                ? "Changing this leaves a 301 behind automatically, so old links keep working."
                : "Leave blank to build one from the name."}>
              <Input id="slug" name="slug" defaultValue={product?.slug} className="font-mono text-[14px]" />
            </Field>

            <Field label="SKU" htmlFor="sku" error={err("sku")}
              hint="The part number. Searched, and copied onto the order so it survives a rename.">
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} className="font-mono text-[14px]" />
            </Field>

            <Field label="Short description" htmlFor="short_description" error={err("short_description")}
              hint="One line, used on the shop cards and as the search-result description. Plain text, max 500 characters.">
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
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Status" htmlFor="status" error={err("status")} variant="float-static">
              <Select id="status" name="status" defaultValue={product?.status ?? "draft"}>
                <option value="draft">Draft</option>
                <option value="published">Published — on sale</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            {/*
              The type decides how an order for this is fulfilled, which is why
              it sits with Status rather than in Selling: it is a fact about the
              thing, not a price.
            */}
            <Field label="Type" htmlFor="type" error={err("type")} variant="float-static"
              hint={type === "physical" ? "Shipped. Stock is counted and dispatch is entered by hand."
                : type === "digital" ? "Delivered as an activation code from inventory, after payment."
                : "Work somebody does. Nothing to ship and no code to issue."}>
              <Select id="type" name="type" value={type}
                onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="physical">Physical</option>
                <option value="digital">Digital</option>
                <option value="service">Service</option>
              </Select>
            </Field>

            <Field label="Category" htmlFor="store_category_id" error={err("store_category_id")}
              hint="The store's own categories, kept separate from the site's." variant="float-static">
              <Select id="store_category_id" name="store_category_id"
                defaultValue={product?.store_category_id ? String(product.store_category_id) : ""}>
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="Brand" htmlFor="brand_id" error={err("brand_id")} variant="float-static">
              <Select id="brand_id" name="brand_id" defaultValue={product?.brand_id ? String(product.brand_id) : ""}>
                <option value="">No brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={product?.sort_order ?? 0} />
            </Field>

            <Field label="Featured" htmlFor="is_featured" hint="Featured products lead the shop." variant="float-static">
              <Select id="is_featured" name="is_featured" defaultValue={product?.is_featured ? "1" : "0"}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </Select>
            </Field>
          </aside>
        </div>

        <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <Field label="Price" htmlFor="price" error={err("price_paise")}
              hint="In rupees, and it includes 18% GST — the figure here is what the customer pays.">
              <Input
                id="price" name="price" inputMode="decimal" required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={Boolean(err("price_paise"))}
              />
            </Field>

            <Field label="Compare-at price" htmlFor="compare_at" error={err("compare_at_paise")}
              hint="Struck through beside the price. Leave blank unless it was genuinely sold at this — the shop hides it when it is not higher.">
              <Input id="compare_at" name="compare_at" inputMode="decimal"
                defaultValue={paiseToRupeeInput(product?.compare_at_paise)} />
            </Field>

            <VariationField
              defaultValue={product?.variations ?? []}
              error={rowErr("variations")}
              productPricePaise={product?.price_paise}
            />

            {/*
              The inventory, linked from the form rather than tucked in the
              sidebar: codes belong to *this* product, and a screen reached
              from nowhere is a screen nobody uses. Only for a digital one —
              on anything else the link would be an offer to do something
              that has no effect.
            */}
            {editing && type === "digital" && (
              <p className="mt-2 text-[13px]">
                <Link href={`/admin/store/products/${product!.id}/codes`} className="font-semibold text-brand-ink underline">
                  Activation codes
                </Link>{" "}
                <span className="text-muted">— the licence keys held for this product.</span>
              </p>
            )}
          </div>

          <aside className="grid content-start gap-0">
            <Field label="Count stock" htmlFor="track_stock" variant="float-static"
              hint="Off for anything that cannot run out — a service, or a licence bought to order.">
              <Select id="track_stock" name="track_stock" value={trackStock ? "1" : "0"}
                onChange={(e) => setTrackStock(e.target.value === "1")}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </Select>
            </Field>

            {/*
              Rendered disabled with the reason rather than hidden, the pattern
              the mail panel uses for an uninstalled transport: a field that
              vanishes is a question somebody has to go and ask a colleague.
            */}
            <Field label="Stock" htmlFor="stock" error={err("stock")}
              hint={trackStock
                ? "How many are on the shelf. A product with variations is counted per variation instead."
                : "Not counted — this product is always available."}>
              <Input id="stock" name="stock" type="number" min={0}
                defaultValue={product?.stock ?? 0} disabled={!trackStock} />
            </Field>

            <Field label="Returnable" htmlFor="returnable" variant="float-static"
              hint="“This product is non-returnable” is shown on the page, in the cart and at the checkout — before anybody pays.">
              <Select id="returnable" name="returnable" defaultValue={product?.returnable === false ? "0" : "1"}>
                <option value="1">Yes</option>
                <option value="0">No — non-returnable</option>
              </Select>
            </Field>
          </aside>
        </div>

        <div className="max-w-[900px]">
          {type === "digital" ? (
            <p className="mb-4 text-[13px] text-muted measure">
              Sent by email the moment an activation code is issued for this
              product, and shown beside the code on the customer&rsquo;s order
              page. Leave both blank to use the store-wide procedure from
              Settings.
            </p>
          ) : (
            /*
              Said rather than hidden, the rule the mail panel follows for an
              uninstalled transport: a field that vanishes is a question
              somebody has to go and ask a colleague.
            */
            <div className="mb-4">
              <Alert tone="info" title="Nothing here is sent for this product">
              This product is {type === "service" ? "a service" : "physical"}, so
              nothing here is sent. An activation procedure goes out with an
              activation code, which only a digital product has.
              </Alert>
            </div>
          )}

          <EditorField
            name="activation_procedure"
            label="Activation procedure"
            defaultValue={product?.activation_procedure ?? ""}
            error={err("activation_procedure")}
          />

          <DocumentField
            name="activation_pdf_path"
            label="Activation document"
            hint="A PDF from the media library - the vendor's own guide or licence terms. Attached to the same email."
            defaultPath={product?.activation_pdf_path}
            defaultName={product?.activation_pdf_name}
            error={err("activation_pdf_path")}
          />
        </div>

        <div>
          <GalleryField
            defaultPaths={product?.images ?? []}
            defaultUrls={product?.image_urls ?? []}
            error={rowErr("images")}
          />
        </div>

        <SeoPanel seo={product?.seo} defaults={product?.seo_defaults} error={seoErr} embedded />
      </Tabs>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
        </Button>
        <Link href="/admin/store/products"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteStoreProductAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(
                  `Delete "${product!.name}"? It comes off the shop immediately. Orders already placed keep their own copy of the name and price.`,
                )) e.preventDefault();
              }}
            >
              Delete product
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
