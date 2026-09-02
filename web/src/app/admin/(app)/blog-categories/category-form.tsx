"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import {
  createBlogCategoryAction, updateBlogCategoryAction, deleteBlogCategoryAction,
  type BlogCategoryFormState,
} from "./actions";
import type { AdminBlogCategory } from "@/lib/admin";

const initial: BlogCategoryFormState = {};

/**
 * One pane, no tabs.
 *
 * Four fields and no SEO panel, which is the line this console already draws:
 * tabs are structure on a nine-field entity form and chrome on this. Brands,
 * FAQs and redirects are the same shape.
 */
export function BlogCategoryForm({
  category, saved,
}: {
  category?: AdminBlogCategory;
  saved?: boolean;
}) {
  const editing = Boolean(category);

  const [state, formAction, pending] = useActionState(
    editing
      ? updateBlogCategoryAction.bind(null, category!.id)
      : createBlogCategoryAction,
    initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          It appears on{" "}
          <Link className="underline" href={`/blog/category/${category?.slug ?? ""}`}>
            its own listing
          </Link>{" "}
          and in the blog sidebar — but only once something published is filed under it.
        </Alert>
      )}

      <div className="max-w-[640px]">
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input
            id="name" name="name" defaultValue={category?.name}
            required aria-invalid={Boolean(err("name"))}
          />
        </Field>

        <Field
          label="Slug" htmlFor="slug" error={err("slug")}
          hint={editing
            ? "The URL: /blog/category/… Changing it leaves a 301 behind automatically."
            : "Leave blank to build one from the name."}
        >
          <Input id="slug" name="slug" defaultValue={category?.slug} className="font-mono text-[14px]" />
        </Field>

        <Field
          label="Description" htmlFor="description" error={err("description")}
          hint="Optional. Shown under the heading on the category page, and used as its meta description."
        >
          <Textarea
            id="description" name="description" rows={3}
            defaultValue={category?.description ?? ""} maxLength={500}
          />
        </Field>

        <Field
          label="Sort order" htmlFor="sort_order" error={err("sort_order")}
          hint="Lowest first, in the strip above the blog and in the sidebar. Not by post count — a list that reorders itself as people publish moves under somebody who has learnt where things are."
        >
          <Input
            id="sort_order" name="sort_order" type="number" min={0} max={9999}
            defaultValue={category?.sort_order ?? 0} className="w-28"
          />
        </Field>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create category"}
        </Button>

        <Link
          href="/admin/blog-categories"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
        >
          Cancel
        </Link>

        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteBlogCategoryAction.bind(null, category!.id)} formNoValidate
              onClick={(e) => {
                // Said before it is pressed rather than after. The articles are
                // the expensive thing, and somebody about to remove a label
                // needs to know it does not take them with it.
                const n = category!.posts_count ?? 0;
                const warning = n
                  ? `Delete "${category!.name}"? The ${n} post${n === 1 ? "" : "s"} filed under it are kept — they simply lose this label.`
                  : `Delete "${category!.name}"? This cannot be undone.`;
                if (!window.confirm(warning)) e.preventDefault();
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
