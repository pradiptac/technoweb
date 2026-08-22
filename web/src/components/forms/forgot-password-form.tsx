"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";

export type ForgotState = { error?: string; sent?: boolean };

/**
 * "Email me a link".
 *
 * The confirmation is deliberately vague — "if that address has an account" —
 * and it is shown whether or not the address exists. The API answers the same
 * way for both, and a form that said "no account with that email" would hand
 * back the enumeration the server is refusing to give: an attacker could
 * submit addresses and learn which ones belong to staff.
 *
 * Shared by the admin and portal screens; only the action and the sign-in link
 * differ.
 */
export function ForgotPasswordForm({
  action, signInHref, signInLabel,
}: {
  action: (prev: ForgotState, formData: FormData) => Promise<ForgotState>;
  signInHref: string;
  signInLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (state.sent) {
    return (
      <>
        <Alert tone="ok" title="Check your inbox">
          If that address has an account, a reset link is on its way. It works
          once and expires in an hour.
        </Alert>
        <p className="text-[14px] text-muted">
          Nothing arrived? Check the spam folder, then{" "}
          <Link href={signInHref} className="font-semibold text-brand-600 hover:underline">
            {signInLabel}
          </Link>{" "}
          and try again — the address may be different from the one you
          remember.
        </p>
      </>
    );
  }

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert tone="err" title="Could not send">{state.error}</Alert>}

      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Button type="submit" className="w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>

      <p className="mt-5 text-center text-[13.5px] text-muted">
        <Link href={signInHref} className="font-semibold text-brand-600 hover:underline">
          {signInLabel}
        </Link>
      </p>
    </form>
  );
}
