"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitFormAction, type SubmitState } from "./form-actions";
import type { FormField, SiteForm } from "@/types/api";

const initial: SubmitState = {};

/**
 * An editor-built form, rendered from its stored definition.
 *
 * The definition decides what appears; the API decides what is accepted. This
 * component renders `required` and `type` because they make the form pleasant
 * to fill in, not because they protect anything — a browser's validation is a
 * courtesy to the person typing and is absent for anything that posts
 * directly.
 *
 * On success the fields are replaced by the confirmation rather than being
 * cleared and left in place: a form that empties itself looks like it lost the
 * message, which is the moment people send it a second time.
 */
export function FormBlock({ form, className }: { form: SiteForm; className?: string }) {
  const action = submitFormAction.bind(null, form.slug);
  const [state, formAction, pending] = useActionState(action, initial);
  const fields = form.fields ?? [];

  if (state.ok) {
    return (
      <div className={className}>
        <Alert tone="ok" title="Message sent">{state.message}</Alert>
      </div>
    );
  }

  return (
    <form action={formAction} className={className} noValidate>
      {state.error && <Alert tone="err" title="Could not send that">{state.error}</Alert>}

      {/*
        The spam trap. Off-screen rather than `display:none` — some bots skip
        hidden inputs — and `aria-hidden` with `tabIndex={-1}` so it is not
        announced and cannot be tabbed into by a person. `autoComplete="off"`
        stops a browser helpfully filling it in and failing a real visitor.
      */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${form.slug}-website`}>Leave this field empty</label>
        <input id={`${form.slug}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FormControl key={field.id} field={field} slug={form.slug} error={state.fieldErrors?.[field.name]?.[0]} />
        ))}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : form.submit_label || "Send"}
      </Button>
    </form>
  );
}

function FormControl({ field, slug, error }: { field: FormField; slug: string; error?: string }) {
  const id = `${slug}-${field.name}`;
  const full = field.width !== "half" || field.kind === "textarea";
  const shared = {
    id,
    name: field.name,
    required: field.required,
    "aria-invalid": Boolean(error),
    placeholder: field.placeholder ?? undefined,
  };

  // A checkbox has its label beside it rather than floating over it, so it
  // does not go through Field at all.
  if (field.kind === "checkbox") {
    return (
      <div className={cn("mb-[18px]", full && "sm:col-span-2")}>
        <label className="flex items-start gap-2.5 text-[14px]">
          <input type="checkbox" name={field.name} value="1" className="mt-0.5 size-4 shrink-0 accent-brand-600" />
          <span>
            {field.label}
            {field.help && <span className="mt-0.5 block text-[12.5px] text-faint">{field.help}</span>}
          </span>
        </label>
        {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn(full && "sm:col-span-2")}>
      <Field
        label={field.label}
        htmlFor={id}
        hint={field.help ?? undefined}
        error={error}
        variant={field.kind === "select" ? "float-static" : "float"}
      >
        {field.kind === "textarea" ? (
          <Textarea {...shared} rows={5} />
        ) : field.kind === "select" ? (
          <Select {...shared}>
            <option value="">Choose…</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ) : (
          <Input
            {...shared}
            type={field.kind === "number" ? "number" : field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : "text"}
            autoComplete={autoCompleteFor(field)}
          />
        )}
      </Field>
    </div>
  );
}

/**
 * A best guess at what a browser should offer to fill in.
 *
 * Keyed on the field's own name, which is the only signal available — an
 * editor naming a field `email` means the same thing everyone else does. Wrong
 * guesses cost nothing; a missing one costs the visitor typing their own
 * address again.
 */
function autoCompleteFor(field: FormField): string | undefined {
  if (field.kind === "email") return "email";
  if (field.kind === "tel") return "tel";

  return { name: "name", company: "organization", organisation: "organization", city: "address-level2" }[field.name];
}
