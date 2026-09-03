"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { registerAction, type RegisterState } from "./actions";
import { CompanyField } from "@/components/forms/company-field";

const initial: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not register you">{state.error}</Alert>}

      {/*
        The honeypot.

        Hidden from sight *and* from assistive technology, and taken out of the
        tab order — a field a screen-reader user is told to fill in is not a
        trap, it is a broken form. `autoComplete="off"` matters as much as the
        rest: a browser helpfully filling this in would lock a real person out
        of registering with no way to see why.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <Field label="Work email address" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <CompanyField error={state.fieldErrors?.company?.[0]} />

      {/*
        Prefilled with the country code rather than placeholdered with it: a
        placeholder disappears the moment somebody types, so a ten-digit
        number ends up stored with no country code at all — which is the one
        thing an SMS or WhatsApp gateway cannot work without.
      */}
      <Field label="Mobile" htmlFor="phone" error={state.fieldErrors?.phone?.[0]}>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue="+91 " required
          aria-invalid={Boolean(state.fieldErrors?.phone)} />
      </Field>

      <PasswordField
        label="Password"
        htmlFor="password"
        name="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password?.[0]}
        hint="At least 12 characters."
        required
        aria-invalid={Boolean(state.fieldErrors?.password)}
      />

      <PasswordField
        label="Confirm password"
        htmlFor="password_confirmation"
        name="password_confirmation"
        autoComplete="new-password"
        error={state.fieldErrors?.password_confirmation?.[0]}
        required
        aria-invalid={Boolean(state.fieldErrors?.password_confirmation)}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating your account…" : "Create my account"}
      </Button>

      <p className="mt-4 text-center text-[13.5px] text-muted">
        Already registered?{" "}
        <Link href="/portal/login" className="font-semibold text-brand-ink hover:underline">
          Sign in
        </Link>
      </p>
    </Form>
  );
}
