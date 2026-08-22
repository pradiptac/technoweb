"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/input";
import { changePasswordAction, type ProfileState } from "./actions";

const initial: ProfileState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <form action={formAction} noValidate className="max-w-[440px]">
      {state.error && <Alert tone="err" title="Could not change">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Password changed">
          Any other devices signed into this account have been signed out. This
          one stays as it is.
        </Alert>
      )}

      <Field label="Current password" htmlFor="current_password" error={err("current_password")}
        hint="Required, so a borrowed unlocked laptop is not enough to lock you out of your own account.">
        <Input id="current_password" name="current_password" type="password"
          autoComplete="current-password" required aria-invalid={Boolean(err("current_password"))} />
      </Field>

      <Field label="New password" htmlFor="password" error={err("password")}
        hint="At least 12 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required
          aria-invalid={Boolean(err("password"))} />
      </Field>

      <Field label="Confirm new password" htmlFor="password_confirmation">
        <Input id="password_confirmation" name="password_confirmation" type="password"
          autoComplete="new-password" required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
