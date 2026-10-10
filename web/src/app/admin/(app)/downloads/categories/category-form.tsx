"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import type { AdminDownloadCategory } from "@/types/downloads";
import {
  createDownloadCategoryAction, updateDownloadCategoryAction, type DownloadState,
} from "../actions";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: DownloadState = {};

/**
 * One shelf of the downloads centre. Five fields and a single pane — tabs
 * are structure on a nine-field entity form and chrome on this, the line
 * blog categories and brands already draw.
 */
export function DownloadCategoryForm({ category }: { category?: AdminDownloadCategory }) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateDownloadCategoryAction.bind(null, category!.id) : createDownloadCategoryAction,
    initial,
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="max-w-[640px]">
        <Field label="Name" htmlFor="name" error={err("name")} hint="What the shelf is called — “Datasheets”, “Firmware”.">
          <Input id="name" name="name" defaultValue={category?.name} required maxLength={120} aria-invalid={Boolean(err("name"))} />
        </Field>

        <Field
          label="Slug" htmlFor="slug" error={err("slug")}
          hint={editing
            ? "The filter in the address: /downloads?category=… Blank to build it again from the name."
            : "Leave blank to build one from the name."}
        >
          <Input id="slug" name="slug" defaultValue={category?.slug} maxLength={140} className="font-mono text-14" />
        </Field>

        <Field
          label="Description" htmlFor="description" error={err("description")}
          hint="Optional. A line under the category's heading on the downloads page. Plain text."
        >
          <Textarea id="description" name="description" rows={3} defaultValue={category?.description ?? ""} maxLength={500} />
        </Field>

        <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lowest first, on the downloads page and in its filter.">
          <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={category?.sort_order ?? 0} className="w-28" />
        </Field>

        <RecordSwitch className="mb-[18px]" name="is_active" defaultChecked={category?.is_active ?? true} label="Shown on the site"
          hint="Switched off, the category and every download in it come off the downloads page. The files are kept." />
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save category" : "Create category"}
        </Button>
        <Link href="/admin/downloads/categories" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
