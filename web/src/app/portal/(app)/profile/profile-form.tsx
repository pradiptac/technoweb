"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { AddressFields } from "@/components/forms/address-fields";
import { updateProfileAction, type ProfileState } from "./actions";
import type { Customer } from "@/types/api";

const initial: ProfileState = {};

export function ProfileForm({ customer }: { customer: Customer }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initial);
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  /*
   * Opened already ticked for somebody the account holds two addresses for.
   *
   * A delivery address is stored only when it was genuinely different, so its
   * presence *is* the previous answer to this question — and re-asking
   * somebody who has answered it once is how a saved address stops feeling
   * saved.
   */
  const [elsewhere, setElsewhere] = useState(Boolean(customer.shipping_address));

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

        <Field label="Mobile" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? "+91 "}
            autoComplete="tel" aria-invalid={Boolean(err("phone"))} />
        </Field>
      </div>

      {/*
        Where orders are invoiced and delivered.

        These columns existed and only the checkout ever wrote them, so an
        address could be changed by placing another order and by no other
        means — stored data with nothing able to reach it. This is that half.

        Nothing here is required. An address is a condition of delivering
        something, not of holding an account, and a profile screen that refuses
        to save a corrected telephone number until a PIN code is typed is a
        screen arguing with whoever opened it.
      */}
      <fieldset className="mt-2 border-t border-line pt-5">
        <legend className="mb-1 text-[15px] font-semibold">Billing and delivery</legend>
        <p className="mb-4 text-[13.5px] text-muted">
          Kept so the shop can fill the checkout in for you. Leave it blank if you would
          rather type it each time.
        </p>

        {/*
          `billing_address`, not the checkout's `address` — that is the key the
          profile endpoint returns errors under, and a mismatch here would not
          fail loudly: every message would simply never be shown, under fields
          that look fine.
        */}
        <AddressFields
          errorPrefix="billing_address"
          defaults={customer.billing_address}
          err={err}
          required={false}
        />

        <Field label="GSTIN (optional)" htmlFor="gstin" error={err("gstin")}
          hint="Only if invoices should be made out to a business.">
          <Input id="gstin" name="gstin" className="font-mono text-[14px]" maxLength={15}
            defaultValue={customer.gstin ?? ""} aria-invalid={Boolean(err("gstin"))} />
        </Field>

        {/*
          Asked the way round that leaves the common case untouched: unticked
          means one address, which is what every account holds until somebody
          says otherwise.
        */}
        <label className="flex items-start gap-2.5 border-t border-line pt-3 text-[14px]">
          <input
            type="checkbox"
            name="ship_elsewhere"
            value="1"
            checked={elsewhere}
            onChange={(e) => setElsewhere(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
          />
          <span>
            Deliver to a different address
            <span className="block text-[12.5px] text-muted">
              An office that is billed and a site the kit is delivered to.
            </span>
          </span>
        </label>

        {elsewhere && (
          <div className="mt-4">
            <AddressFields
              prefix="ship_"
              errorPrefix="shipping_address"
              autoCompletePrefix="shipping "
              defaults={customer.shipping_address}
              err={err}
              required={false}
            />
          </div>
        )}
      </fieldset>

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
