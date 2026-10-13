"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { RecordSwitch } from "@/components/admin/record-switch";
import {
  createTenderCategoryAction, deleteTenderCategoryAction, updateTenderCategoryAction, type TenderState,
} from "../actions";
import type { AdminTenderCategory } from "@/lib/admin";

const initial: TenderState = {};

/**
 * One tender category. Five fields and a single pane — tabs are structure on
 * a nine-field entity form and chrome on this, the line the download and
 * blog categories already draw.
 */
export function TenderCategoryForm({ category }: { category?: AdminTenderCategory }) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateTenderCategoryAction.bind(null, category!.id) : createTenderCategoryAction,
    initial,
  );
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state}>
      {editing && <input type="hidden" name="id" value={category!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="max-w-[640px]">
        <Field label="Name" htmlFor="name" error={err("name")} hint="What the category is called — “Networking”, “Annual maintenance”.">
          <Input id="name" name="name" defaultValue={category?.name} maxLength={120} aria-invalid={Boolean(err("name"))} />
        </Field>

        <Field
          label="Slug" htmlFor="slug" error={err("slug")}
          hint={editing
            ? "The filter in the address: /tenders?category=… Blank to build it again from the name."
            : "Leave blank to build one from the name."}
        >
          <Input id="slug" name="slug" defaultValue={category?.slug} maxLength={140} className="font-mono text-14" />
        </Field>

        <Field
          label="Description" htmlFor="description" error={err("description")}
          hint="Optional. A line about the category, for your own reference. Plain text."
        >
          <Textarea id="description" name="description" rows={3} defaultValue={category?.description ?? ""} maxLength={500} />
        </Field>

        <Field label="Order" htmlFor="sort_order" error={err("sort_order")} hint="Lowest first, in the filter on the Tenders page.">
          <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={category?.sort_order ?? 0} className="w-28" />
        </Field>

        <RecordSwitch
          className="mb-[18px]" name="is_active" defaultChecked={category?.is_active ?? true} label="Shown on the site"
          hint="Switched off, the category and every tender in it come off the Tenders page. The tenders are kept."
        />
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save category" : "Create category"}
        </Button>
        <Link
          href="/admin/tenders/categories"
          className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink"
        >
          Cancel
        </Link>
        {editing && (
          <Button
            type="submit"
            variant="destructive"
            className="ml-auto"
            formAction={deleteTenderCategoryAction}
            formNoValidate
            onClick={(event) => {
              const held = category!.tenders_count;
              const warning = held > 0
                ? `Delete “${category!.name}”? Its ${held} ${held === 1 ? "tender stays" : "tenders stay"}, filed under no category.`
                : `Delete “${category!.name}”?`;

              if (!window.confirm(warning)) event.preventDefault();
            }}
          >
            Delete
          </Button>
        )}
      </FormActions>
    </Form>
  );
}
