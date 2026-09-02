"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { FieldBuilder } from "./field-builder";
import { createFormAction, updateFormAction, type FormState } from "./actions";
import type { SiteForm } from "@/types/api";

const initial: FormState = {};

export function FormForm({ form, saved }: { form?: SiteForm; saved?: boolean }) {
  const action = form ? updateFormAction.bind(null, form.id) : createFormAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(form?.slug ?? "");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state}>
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The form is live wherever its shortcode appears.</Alert>
      )}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={form?.name} required />
        </Field>

        <Field label="Slug" htmlFor="slug" error={err("slug")}
          hint="Leave blank to generate one. Changing it breaks every shortcode already using it.">
          <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contact" />
        </Field>

        <Field label="Status" htmlFor="status" variant="float-static">
          <Select id="status" name="status" defaultValue={form?.status ?? "published"}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>

        <Field label="Submit button label" htmlFor="submit_label" error={err("submit_label")}>
          <Input id="submit_label" name="submit_label" defaultValue={form?.submit_label ?? "Send"} />
        </Field>

        <Field label="Notify" htmlFor="notify_email" error={err("notify_email")}
          hint="Where submissions are emailed. Blank uses the sales address from Settings.">
          <Input id="notify_email" name="notify_email" type="email" defaultValue={form?.notify_email ?? ""} />
        </Field>

        <Field label="Message after sending" htmlFor="success_message" error={err("success_message")}
          hint="Shown in place of the fields once it has gone.">
          <Textarea id="success_message" name="success_message" rows={2} defaultValue={form?.success_message ?? ""} />
        </Field>
      </div>

      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-[13px] font-semibold">Put this form on a page</p>
        <p className="mt-1 text-[13px] text-muted">
          Paste this into any page, post, article or case-study body:
        </p>
        <code className="mt-2 block rounded border border-line bg-card px-3 py-2 font-mono text-[13px] select-all">
          {`[form slug="${slug || "your-slug"}"]`}
        </code>
      </div>

      <h2 className="admin-title mb-3 text-[17px]">Fields</h2>
      <FieldBuilder fields={form?.fields ?? []} />

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : form ? "Save form" : "Create form"}
        </Button>
      </FormActions>
    </Form>
  );
}
