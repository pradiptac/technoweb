"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert tone="err" title="Could not sign you in">{state.error}</Alert>}

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

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="mt-4 text-center text-[13.5px]">
        <Link href="/portal/forgot-password" className="font-semibold text-brand-600 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
