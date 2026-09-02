"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";

export type ResetState = { error?: string; fieldErrors?: Record<string, string[]>; done?: boolean };

/**
 * "Choose a new password", reached from the emailed link.
 *
 * The token and address travel in hidden fields rather than being read from
 * the URL by the browser at submit time, so a stale query string cannot end up
 * posting a different account's token than the one the page was rendered for.
 *
 * Shared by the admin and portal screens.
 */
export function ResetPasswordForm({
  action, token, email, signInHref, signInLabel,
}: {
  action: (prev: ResetState, formData: FormData) => Promise<ResetState>;
  token: string;
  email: string;
  signInHref: string;
  signInLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  if (state.done) {
    return (
      <>
        <Alert tone="ok" title="Password changed">
          Every other device signed into this account has been signed out.
        </Alert>
        <Link
          href={signInHref}
          className="inline-block rounded bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-2"
        >
          {signInLabel}
        </Link>
      </>
    );
  }

  // A link that arrives without both halves cannot work, and saying so beats
  // a form that fails on submit for reasons nobody can see.
  if (!token || !email) {
    return (
      <Alert tone="err" title="That link is incomplete">
        Open the link from the email exactly as it was sent — some mail clients
        break long URLs across lines. If it keeps failing, request a new one.
      </Alert>
    );
  }

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not reset">{state.error}</Alert>}

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />

      <p className="mb-5 text-[14px] text-muted">
        Setting a new password for <strong className="text-ink">{email}</strong>.
      </p>

      <PasswordField
        label="New password" htmlFor="password" name="password"
        autoComplete="new-password" error={err("password")}
        hint="At least 12 characters. A short phrase you can remember beats a short jumble you cannot."
        required autoFocus aria-invalid={Boolean(err("password"))}
      />

      <PasswordField
        label="Confirm new password" htmlFor="password_confirmation"
        name="password_confirmation" autoComplete="new-password" required
      />

      <Button type="submit" className="w-full justify-center" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>

      <p className="mt-5 text-center text-[13.5px] text-muted">
        <Link href={signInHref} className="font-semibold text-brand-ink hover:underline">
          {signInLabel}
        </Link>
      </p>
    </Form>
  );
}
