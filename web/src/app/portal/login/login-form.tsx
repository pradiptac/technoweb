"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { ResendButton } from "../register/check-your-email/resend-button";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} noValidate>
      {/*
        Three different refusals, three different screens.

        "Waiting for approval" is not an error the person can act on, so it is
        an info panel with nothing to press — offering a button there would be
        pretending they had a move to make. "Confirm your address" is the
        opposite: it is entirely actionable, and the resend lives right beside
        the message rather than a page away.
      */}
      {state.reason === "pending_approval" ? (
        <Alert tone="info" title="Your account is not live yet">
          {state.error} Nothing more is needed from you.
        </Alert>
      ) : state.reason === "email_unverified" ? (
        <>
          <Alert tone="warn" title="Confirm your address first">
            {state.error}
          </Alert>
          {state.email && <ResendButton email={state.email} />}
        </>
      ) : (
        state.error && <Alert tone="err" title="Could not sign you in">{state.error}</Alert>
      )}

      <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <PasswordField
        label="Password"
        htmlFor="password"
        name="password"
        error={state.fieldErrors?.password?.[0]}
        required
        aria-invalid={Boolean(state.fieldErrors?.password)}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="mt-4 text-center text-[13.5px]">
        <Link href="/portal/forgot-password" className="font-semibold text-brand-ink hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
