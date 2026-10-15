"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import type { DetailTemplateKind } from "@/types/api";
import { createTemplateAction, type NewTemplateState } from "../actions";

const initial: NewTemplateState = {};

/**
 * The first step of a template: its kind, its name, and where to start —
 * from the layout the page has today (the record blocks, in the order the
 * route draws them, which the API sends per kind) or from the body alone.
 */
export function NewTemplateForm({ kinds, initialType }: { kinds: DetailTemplateKind[]; initialType?: string }) {
  const [state, formAction, pending] = useActionState(createTemplateAction, initial);
  const [type, setType] = useState(initialType ?? kinds[0]?.value ?? "");
  const kind = kinds.find((k) => k.value === type);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not create the template">{state.error}</Alert>}

      <div className="max-w-xl">
        <Field label="Kind of page" htmlFor="type" error={err("type")} variant="float-static"
          hint={kind ? `Applies to every ${kind.noun} page, while it is switched on.` : undefined}>
          <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>

        <Field label="Name" htmlFor="name" error={err("name")} hint="For your own list, such as “Spring layout”.">
          <Input id="name" name="name" required maxLength={120} aria-invalid={Boolean(err("name"))} />
        </Field>

        <fieldset className="mb-[18px] grid gap-2">
          <legend className="mb-2 text-14 font-semibold">Start from</legend>
          <label className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 text-13-5">
            <input type="radio" name="start" value="today" defaultChecked className="mt-1 size-4 accent-brand-600" />
            <span>
              <strong className="block font-semibold">Today’s layout</strong>
              <span className="text-muted">The parts of the page in the order it draws them now{kind ? ` — ${kind.today.length} of them` : ""}. Move one, add a section, and switch it on.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 text-13-5">
            <input type="radio" name="start" value="body" className="mt-1 size-4 accent-brand-600" />
            <span>
              <strong className="block font-semibold">The body alone</strong>
              <span className="text-muted">Only the record’s body. Add the other parts, and sections of your own, one at a time.</span>
            </span>
          </label>
        </fieldset>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>{pending ? "Creating…" : "Create template"}</Button>
        <Link href="/admin/detail-templates" className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted hover:bg-surface-2 hover:text-ink">Cancel</Link>
      </FormActions>
    </Form>
  );
}
