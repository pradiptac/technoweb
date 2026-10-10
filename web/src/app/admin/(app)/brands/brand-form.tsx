"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { AeoGeoPanel } from "@/components/admin/aeo-geo-panel";
import { AnswerBlocksField } from "@/components/admin/answer-blocks-field";
import { FaqField } from "@/components/admin/faq-field";
import { Tabs } from "@/components/admin/tabs";
import { buildFormTabs, type TabGroup } from "@/components/admin/form-tabs";
import {
  createBrandAction, updateBrandAction, deleteBrandAction, type BrandFormState,
} from "./actions";
import type { AdminBrand, AnswerBlockKindOption } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: BrandFormState = {};

/**
 * Two panels since 2026-09-21. A brand was the one-pane form — no status, no
 * SEO — and it still has neither; what it gained is answer blocks and FAQs
 * (docs/aeo-geo-contract.md §1–2), which are an AEO tab on every entity
 * that carries them, this one included. The field lists map a 422 back to
 * the tab holding it — see buildFormTabs.
 */
const GROUPS: TabGroup[] = [
  { id: "content", label: "Content",
    fields: ["name", "slug", "description", "logo_path", "sort_order", "is_featured", "partner_tier"] },
  { id: "aeo", label: "AEO", fields: ["answer_blocks", "faqs"] },
];

export function BrandForm({
  brand, saved, kinds,
}: {
  brand?: AdminBrand;
  saved?: boolean;
  /** `meta.answer_block_kinds` from this entity's admin index. */
  kinds: AnswerBlockKindOption[];
}) {
  const editing = Boolean(brand);
  const [state, formAction, pending] = useActionState(
    editing ? updateBrandAction : createBrandAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  /** Per-row errors arrive as e.g. answer_blocks.0.answer; surface the first. */
  const rowErr = (prefix: string) =>
    err(prefix) ?? Object.entries(state.fieldErrors ?? {}).find(([k]) => k.startsWith(`${prefix}.`))?.[1]?.[0];

  const { tabs, jumpTo } = buildFormTabs(GROUPS, state.fieldErrors);

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={brand!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Brands filter the <Link className="underline" href="/products">product listing</Link>.
        </Alert>
      )}

      {/* One child per tab — `Tabs` reads `children[i]` positionally. */}
      <Tabs tabs={tabs} jumpTo={jumpTo} jumpNonce={state}>
      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={brand?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint={editing
              ? "Used in the ?brand= filter on the product listing."
              : "Leave blank to build one from the name."}>
            <Input id="slug" name="slug" defaultValue={brand?.slug} className="font-mono text-14" />
          </Field>

          <Field label="Description" htmlFor="description" error={err("description")}
            hint="Optional. Plain text — a sentence on what this manufacturer is known for.">
            <Textarea id="description" name="description" rows={4} defaultValue={brand?.description ?? ""} maxLength={2000} />
          </Field>
        </div>

        <aside className="grid content-start gap-0">
          <CoverField
            name="logo_path"
            label="Logo"
            hint="PNG or SVG with a transparent background. Around 400 x 200 px; it is shown small and never cropped."
            defaultPath={brand?.logo_path ?? null}
            defaultUrl={brand?.logo ?? null}
          />

          <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
            hint="Lower numbers come first in the brand filter.">
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={brand?.sort_order ?? 0} />
          </Field>

          <RecordSwitch className="mb-[18px]" name="is_featured" defaultChecked={brand?.is_featured ?? false} label="Featured"
            hint="Featured brands lead the filter list." />

          <Field label="Partner tier" htmlFor="partner_tier" error={err("partner_tier")}
            hint="“Gold Partner”, “Authorised Reseller”. Filled in, the logo and this line appear on the Certifications page under “Authorised partner”. Blank means no claim.">
            <Input id="partner_tier" name="partner_tier" defaultValue={brand?.partner_tier ?? ""} maxLength={80} />
          </Field>

          <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-12-5 leading-[1.5] text-muted">
            Brands have no draft state and no SEO settings — they are a filter on
            the product listing, not a page of their own. The AEO tab is what a
            brand does carry: the answers and FAQs the brand page quotes.
          </p>
        </aside>
      </div>

      {/*
        The AEO tab, one child. A brand is not on the SEO overview, so the
        readiness panel says "not scored" here rather than showing a figure.
      */}
      <div>
        <AeoGeoPanel record={brand ? { type: 'brand', id: brand.id } : null} blocks={brand?.answer_blocks} />
        <AnswerBlocksField defaultValue={brand?.answer_blocks ?? []} kinds={kinds} error={rowErr("answer_blocks")} />
        <FaqField defaultValue={brand?.faqs ?? []} error={rowErr("faqs")} />
      </div>
      </Tabs>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create brand"}
        </Button>
        <Link href="/admin/brands" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteBrandAction} formNoValidate
              onClick={(e) => {
                const n = brand!.product_count ?? 0;
                const warning = n
                  ? `Delete "${brand!.name}"? ${n} product${n === 1 ? "" : "s"} will stay in the catalogue but lose its brand.`
                  : `Delete "${brand!.name}"? This cannot be undone.`;
                if (!window.confirm(warning)) e.preventDefault();
              }}
            >
              Delete brand
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
