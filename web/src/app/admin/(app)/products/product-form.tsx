"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea, Select } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { FaqField } from "@/components/admin/faq-field";
import { DocumentField } from "@/components/admin/document-field";
import { GalleryField } from "@/components/admin/gallery-field";
import { RelationPicker } from "@/components/admin/relation-picker";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { SeoPanel } from "@/components/admin/seo-panel";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import { BodyReplacedNote, RecordSectionsPanel, SECTIONS_TAB, useRecordSections } from "../pages/builder/record-sections";
import { CustomFieldsPanel, customFieldError, withFieldsTab } from "@/components/admin/custom-fields-panel";
import { SpecField } from "@/components/admin/spec-field";
import { StringListField } from "@/components/admin/string-list-field";
import {
  createProductAction, updateProductAction, deleteProductAction, type ProductFormState,
} from "./actions";
import type { CustomFieldGroupDefinition, AdminProduct, PickerOption, AnswerBlockKindOption, PageBuilderOptions } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: ProductFormState = {};

/**
 * Four panels rather than one 1,878px scroll — this is the largest form in
 * the console. The field lists map a 422 back to the tab holding it.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "sku", "short_description", "description",
             "specifications", "features", "status", "brand_id",
             "product_category_id", "sort_order", "is_featured", "availability"] },
  // Sections in place of the written body (0.130.0) — the choice and the builder.
  SECTIONS_TAB,
  { id: "media", label: "Media", fields: ["images", "datasheet_path"] },
  { id: "related", label: "Related",
    fields: ["solution_ids", "related_product_ids", "faqs"] },
  { id: "seo", label: "SEO", fields: ["seo"] },
  // The AEO tab (docs/aeo-geo-contract.md §7). Last, so every tab above keeps its place.
  { id: "aeo", label: "AEO", fields: ["answer_blocks"] },
];

export function ProductForm({
  product, brands, categories, solutions, products, saved, kinds, fieldGroups, builder,
}: {
  product?: AdminProduct;
  brands: PickerOption[];
  categories: PickerOption[];
  solutions: PickerOption[];
  products: PickerOption[];
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
  /** `meta.custom_field_groups` from the index, for a new record; an edit reads the record's own. */
  fieldGroups?: CustomFieldGroupDefinition[];
  /** `GET /admin/pages/builder` — the section builder's types and pickers, for the Sections tab. */
  builder: PageBuilderOptions;
}) {
  const editing = Boolean(product);
  const [state, formAction, pending] = useActionState(
    editing ? updateProductAction : createProductAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const seoErr = (f: string) => state.fieldErrors?.[`seo.${f}`]?.[0];
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  // The body area: the written body, or builder sections (0.130.0).
  const body = useRecordSections(product);

  // Custom fields (docs/custom-content.md): the groups that apply, from the API.
  const customGroups = product?.custom_field_groups ?? fieldGroups ?? [];
  const { tabs, jumpTo } = buildFormTabs(withFieldsTab(GROUPS, customGroups), state.fieldErrors);

  // A product cannot be related to itself; the server refuses it too.
  const relatable = products.filter((p) => p.id !== product?.id);

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={product!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Live at <Link className="underline" href={`/products/${product!.slug}`}>/products/{product!.slug}</Link>.
        </Alert>
      )}

      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
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
              <Input id="slug" name="slug" defaultValue={product?.slug} className="font-mono text-14" />
            </Field>

            <Field label="SKU" htmlFor="sku" error={err("sku")}
              hint="The manufacturer part number, shown on the product page.">
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} className="font-mono text-14" />
            </Field>

            <Field label="Short description" htmlFor="short_description" error={err("short_description")}
              hint="One line, used on catalogue cards and as the search-result description. Plain text, max 500 characters.">
              <Textarea id="short_description" name="short_description" rows={3}
                defaultValue={product?.short_description ?? ""} maxLength={500} />
            </Field>

            <BodyReplacedNote state={body} />

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
              <Select
                id="status" name="status" defaultValue={product?.status ?? "draft"}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <Field label="Brand" htmlFor="brand_id" error={err("brand_id")} variant="float-static">
              <Select
                id="brand_id" name="brand_id" defaultValue={product?.brand_id ? String(product.brand_id) : ""}
              >
                <option value="">No brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>

            <Field label="Category" htmlFor="product_category_id" error={err("product_category_id")}
              hint="Decides which /products/… listing this appears on." variant="float-static">
              <Select
                id="product_category_id" name="product_category_id"
                defaultValue={product?.product_category_id ? String(product.product_category_id) : ""}
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
              hint="Lower numbers come first within a category.">
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={product?.sort_order ?? 0} />
            </Field>

            {/*
              Feeds `availability` in the product's Offer, and is deliberately
              allowed to stay empty: an unset value is omitted from the markup,
              where a default of "In stock" would be a claim about stock this
              business has never tracked. The wording explains each option
              because the stored values are schema.org's own vocabulary — one
              mapping, in one place, rather than a translation table.
            */}
            <Field label="Availability" htmlFor="availability" variant="float-static"
              hint="Shown to search engines, not on the page. Leave unset if you would rather not say.">
              <Select id="availability" name="availability" defaultValue={product?.availability ?? ""}>
                <option value="">Not stated</option>
                <option value="InStock">In stock — held here, or a normal lead time</option>
                <option value="BackOrder">Supplied to order — the usual answer for a catalogue line</option>
                <option value="LimitedAvailability">Limited availability — allocation is tight</option>
                <option value="Discontinued">Discontinued — kept for people still running one</option>
              </Select>
            </Field>

            <RecordSwitch className="mb-[18px]" name="is_featured" defaultChecked={product?.is_featured ?? false} label="Featured"
              hint="Featured products lead the catalogue." />
          </aside>
        </div>

        {/* Sections in place of the written body. One child, always mounted. */}
        <RecordSectionsPanel
          state={body}
          builder={builder}
          media={product?.blocks_media ?? {}}
          errors={state.fieldErrors ?? {}}
          bodyField="description"
          storedBody={product?.description ?? ""}
          noun="product"
          keeps="Its pictures, specifications, features, the enquiry panel, FAQs and related products stay where they are."
        />

        <div>
          <GalleryField
            defaultPaths={product?.images ?? []}
            defaultUrls={product?.image_urls ?? []}
            error={rowErr("images")}
          />

          {/*
            The hidden input always posts, so an existing datasheet is kept on
            save and "Remove" posts "" — which the action turns into null.
            Without this control the action posted null on every save and
            silently dropped whatever datasheet the product had.
          */}
          <DocumentField
            name="datasheet_path"
            label="Datasheet (PDF)"
            hint="Optional. Linked from the product page as “Download datasheet”. It is a public document."
            defaultPath={product?.datasheet_path ?? null}
            defaultName={product?.datasheet_path?.split("/").pop() ?? null}
            error={err("datasheet_path")}
          />
        </div>

        <div>
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

          <FaqField defaultValue={product?.faqs ?? []} error={rowErr("faqs")} />
        </div>

        <SeoPanel seo={product?.seo} defaults={product?.seo_defaults} error={seoErr} embedded record={product ? { type: 'product', id: product.id } : null} />

        {/*
          The AEO tab, one child: the readiness scores and the assistant on
          top, the answer blocks under them. See docs/aeo-geo-contract.md §7.
        */}
        <div>
          <AeoGeoPanel record={product ? { type: 'product', id: product.id } : null} blocks={product?.answer_blocks} />
          <AnswerBlocksField defaultValue={product?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        </div>

        {/* The Fields tab — last, and only when a custom field group applies. */}
        {customGroups.length > 0 && (
          <CustomFieldsPanel groups={customGroups} values={product?.custom_fields} media={product?.custom_field_media}
            error={customFieldError(state.fieldErrors)} />
        )}
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
        </Button>
        <Link href="/admin/products" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
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
      </FormActions>
    </Form>
  );
}
