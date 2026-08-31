"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import {
  createStoreCategoryAction, deleteStoreCategoryAction, updateStoreCategoryAction, type StoreFormState,
} from "../actions";
import type { AdminStoreCategory } from "@/types/api";

const initial: StoreFormState = {};

/**
 * One pane, no tabs.
 *
 * Six fields, and the dividing line this console already uses is "does it have
 * a SEO panel" — which is exactly the set of forms where tabs are structure
 * rather than chrome. A category is a label on a listing, not a page.
 */
export function StoreCategoryForm({ category }: { category?: AdminStoreCategory }) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateStoreCategoryAction : createStoreCategoryAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={category!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

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
    </form>
  );
}
