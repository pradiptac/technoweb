"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { FormDraft } from "@/components/admin/form-draft";
import { FormActions } from "@/components/admin/form-actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { IconField } from "@/components/admin/icon-field-lazy";
import {
  createServiceCategoryAction, updateServiceCategoryAction, deleteServiceCategoryAction,
  type ServiceCategoryFormState,
} from "./actions";
import type { AdminServiceCategory } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: ServiceCategoryFormState = {};

/**
 * One pane, no tabs: seven fields, and no SEO — a service category has no
 * page of its own. It is the tab a service is filed under on the homepage's
 * services section and on /services.
 */
export function ServiceCategoryForm({
  category, saved,
}: {
  category?: AdminServiceCategory;
  saved?: boolean;
}) {
  const editing = Boolean(category);
  const [state, formAction, pending] = useActionState(
    editing ? updateServiceCategoryAction : createServiceCategoryAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {/* A draft in localStorage, offered back after a refresh or a crash. */}
      <FormDraft />
      {editing && <input type="hidden" name="id" value={category!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">
          Its tab on <Link className="underline" href="/services">/services</Link> and the homepage follows the change.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={category?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint={editing
              ? "Letters, numbers and dashes. The tab's address: /services#slug — a link to the old one opens the first tab."
              : "Leave blank to build one from the name. Letters, numbers and dashes; it names the tab: /services#slug."}>
            <Input id="slug" name="slug" defaultValue={category?.slug} className="font-mono text-14" />
          </Field>

          <Field label="Description" htmlFor="description" error={err("description")}
            hint="Plain text. A sentence about what the category covers.">
            <Textarea id="description" name="description" rows={3} defaultValue={category?.description ?? ""} maxLength={1000} />
          </Field>

          <IconField defaultValue={category?.icon ?? null} error={err("icon")} />
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Sort order" htmlFor="sort_order" error={err("sort_order")}
            hint="Lower numbers come first in the row of tabs.">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={65535} defaultValue={category?.sort_order ?? 0} />
          </Field>

          <RecordSwitch className="mb-[18px]" name="is_active" defaultChecked={category?.is_active ?? true} label="Active"
            hint={<>Switched off, the tab disappears and its services are listed under &ldquo;Other services&rdquo;.</>} />

          <RecordSwitch className="mb-[18px]" name="image_background" defaultChecked={category?.image_background ?? false} label="Show service pictures as card backgrounds"
            hint="Each service card becomes its picture, with the name and summary over a dark fade at its foot. A service with no picture keeps an ordinary card." />

          <p className="mb-[18px] rounded border border-line-strong bg-surface p-3 text-12-5 leading-[1.5] text-muted">
            Categories have no draft state and no page of their own. A category with no published
            service is not shown. Deleting one keeps its services; they move to &ldquo;Other services&rdquo;.
          </p>
        </aside>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create category"}
        </Button>
        <Link href="/admin/service-categories" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteServiceCategoryAction} formNoValidate
              onClick={(e) => {
                const n = category!.services_count ?? 0;
                const warning = n
                  ? `Delete "${category!.name}"? Its ${n} service${n === 1 ? "" : "s"} will be kept, uncategorised, under "Other services".`
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
