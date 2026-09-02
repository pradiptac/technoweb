"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { updateProfileAction, type ProfileState } from "./actions";
import type { Customer } from "@/types/api";

const initial: ProfileState = {};

export function ProfileForm({ customer }: { customer: Customer }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title="Saved">Your details have been updated.</Alert>}

      <Field label="Name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" defaultValue={customer.name} autoComplete="name"
          aria-invalid={Boolean(err("name"))} />
      </Field>

      <Field label="Email address" htmlFor="email" error={err("email")}
        hint="This is also your login.">
        <Input id="email" name="email" type="email" defaultValue={customer.email}
          autoComplete="email" aria-invalid={Boolean(err("email"))} />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="company" error={err("company")}>
          <Input id="company" name="company" defaultValue={customer.company ?? ""}
            autoComplete="organization" aria-invalid={Boolean(err("company"))} />
        </Field>

        <Field label="Phone" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? ""}
            autoComplete="tel" aria-invalid={Boolean(err("phone"))} />
        </Field>
      </div>

      <fieldset className="mt-2 border-t border-line pt-5">
        <legend className="sr-only">Change password</legend>
        <p className="mb-4 text-[13.5px] text-muted">
          Leave these blank to keep your current password. Changing it signs you out
          everywhere else.
        </p>

        <Field label="Current password" htmlFor="current_password" error={err("current_password")}>
          <Input id="current_password" name="current_password" type="password"
            autoComplete="current-password" aria-invalid={Boolean(err("current_password"))} />
        </Field>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="password" error={err("password")}
            hint="At least 12 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password"
              aria-invalid={Boolean(err("password"))} />
          </Field>

          <Field label="Confirm new password" htmlFor="password_confirmation">
            <Input id="password_confirmation" name="password_confirmation" type="password"
              autoComplete="new-password" />
          </Field>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </Form>
  );
}
