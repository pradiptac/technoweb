"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { saveDetailsAction, type CustomerActionState } from "./actions";
import type { AdminCustomer } from "@/types/api";

const initial: CustomerActionState = {};

export function DetailsForm({ customer }: { customer: AdminCustomer }) {
  const [state, formAction, pending] = useActionState(saveDetailsAction, initial);

  return (
    <Form action={formAction} state={state}>
      {/* Success is announced by the page, from the URL the action redirects
          to — see the note in actions.ts. Only failure is rendered here. */}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <input type="hidden" name="id" value={customer.id} />

      <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
        <Input id="name" name="name" defaultValue={customer.name} required />
      </Field>

      <Field
        label="Email address"
        htmlFor="email"
        error={state.fieldErrors?.email?.[0]}
        hint="Changing this un-confirms the account and sends a fresh confirmation link to the new address."
      >
        <Input id="email" name="email" type="email" defaultValue={customer.email} required />
      </Field>

      <Field label="Company" htmlFor="company" error={state.fieldErrors?.company?.[0]}>
        <Input id="company" name="company" defaultValue={customer.company ?? ""} />
      </Field>

      <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone?.[0]}>
        <Input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? ""} />
      </Field>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </Form>
  );
}
