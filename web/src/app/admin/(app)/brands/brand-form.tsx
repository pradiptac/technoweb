"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import {
  createBrandAction, updateBrandAction, deleteBrandAction, type BrandFormState,
} from "./actions";
import type { AdminBrand } from "@/types/api";

const initial: BrandFormState = {};

export function BrandForm({ brand, saved }: { brand?: AdminBrand; saved?: boolean }) {
  const editing = Boolean(brand);
  const [state, formAction, pending] = useActionState(
    editing ? updateBrandAction : createBrandAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={brand!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Brands filter the <Link className="underline" href="/products">product listing</Link>.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={brand?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint={editing
              ? "Used in the ?brand= filter on the product listing."
              : "Leave blank to build one from the name."}>
            <Input id="slug" name="slug" defaultValue={brand?.slug} className="font-mono text-[14px]" />
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
            defaultPath={brand?.logo_path ?? null}
            defaultUrl={brand?.logo ?? null}
          />

          <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
            hint="Lower numbers come first in the brand filter.">
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={brand?.sort_order ?? 0} />
          </Field>

          <Field label="Featured" htmlFor="is_featured"
            hint="Featured brands lead the filter list.">
            <select
              id="is_featured" name="is_featured"
              defaultValue={brand?.is_featured ? "1" : "0"}
              className="w-full rounded border border-line-strong bg-white px-3 py-2.5 text-[14px]"
            >
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </Field>

          <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-[12.5px] leading-[1.5] text-muted">
            Brands have no draft state and no SEO settings — they are a filter on
            the product listing, not a page of their own.
          </p>
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create brand"}
        </Button>
        <Link href="/admin/brands" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
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
      </div>
    </form>
  );
}
