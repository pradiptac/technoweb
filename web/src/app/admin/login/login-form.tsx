"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Alert, Field, Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import {
  loginAction, sendCodeAction, verifyCodeAction,
  type CodeState, type LoginState,
} from "./actions";

const initialLogin: LoginState = {};
const initialSend: CodeState = { step: "email" };
const initialVerify: CodeState = { step: "code" };

/**
 * Staff sign-in, by code or by password.
 *
 * Codes are the default here as well as on the portal, and that is the more
 * consequential of the two decisions: whoever can read a staff mailbox can
 * sign in as that person, where a password sign-in needed the mailbox *and*
 * something known. It is reversible from Settings without a deploy —
 * `otp_admin_login_enabled` — which is why this component takes the choice as
 * a prop rather than assuming it.
 */
export function LoginForm({
  otpEnabled = true,
  passwordEnabled = true,
}: {
  otpEnabled?: boolean;
  passwordEnabled?: boolean;
}) {
  const [mode, setMode] = useState<"code" | "password">(otpEnabled ? "code" : "password");

  if (mode === "password" || !otpEnabled) {
    return <PasswordSignIn onUseCode={otpEnabled ? () => setMode("code") : undefined} />;
  }

  return <CodeSignIn onUsePassword={passwordEnabled ? () => setMode("password") : undefined} />;
}

/* ------------------------------------------------------------ by a code */

function CodeSignIn({ onUsePassword }: { onUsePassword?: () => void }) {
  const [sent, sendAction, sending] = useActionState(sendCodeAction, initialSend);
  const [verified, verifyAction, verifying] = useActionState(verifyCodeAction, initialVerify);

  const email = verified.email ?? sent.email;
  const remember = verified.remember ?? sent.remember ?? true;
  const onCodeStep = sent.step === "code" && verified.step === "code";

  if (!onCodeStep) {
    return (
      <form action={sendAction} noValidate>
        {sent.error && <Alert tone="err" title="Could not send a code">{sent.error}</Alert>}

        <Field
          label="Email address"
          htmlFor="email"
          error={sent.fieldErrors?.email?.[0]}
          hint="We will email you a six-digit code. No password needed."
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={sent.email}
            required
            aria-invalid={Boolean(sent.fieldErrors?.email)}
          />
        </Field>

        <RememberCheckbox defaultChecked={remember} />

        <Button type="submit" disabled={sending} className="w-full">
          {sending ? "Sending…" : "Email me a sign-in code"}
        </Button>

        {onUsePassword && <SwitchLink onClick={onUsePassword}>Use your password instead</SwitchLink>}
      </form>
    );
  }

  return (
    <>
      <form action={verifyAction} noValidate>
        {verified.error && <Alert tone="err" title="Could not sign you in">{verified.error}</Alert>}

        {/* Alongside an error, not instead of it — after a resend both are
            true, and hiding this leaves the old failure standing alone. */}
        {sent.sent && (
          <Alert tone="ok" title="Check your email" dismissible={false}>
            We have sent a code to <strong>{email}</strong>. It expires in ten minutes.
          </Alert>
        )}

        <input type="hidden" name="email" value={email ?? ""} />
        {/*
          The choice made on the first step, carried rather than asked again.
          A hidden input because an unchecked box is simply absent from
          FormData, so the value has to be written out explicitly to survive.
        */}
        {remember && <input type="hidden" name="remember" value="1" />}

        <CodeField error={verified.fieldErrors?.code?.[0]} />

        <Button type="submit" disabled={verifying} className="w-full">
          {verifying ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <form action={sendAction} className="mt-3">
        <input type="hidden" name="email" value={email ?? ""} />
        {remember && <input type="hidden" name="remember" value="1" />}
        <Button type="submit" variant="secondary" disabled={sending} className="w-full">
          {sending ? "Sending…" : "Send a new code"}
        </Button>
      </form>

      {onUsePassword && <SwitchLink onClick={onUsePassword}>Use your password instead</SwitchLink>}
    </>
  );
}

/* -------------------------------------------------------- by a password */

function PasswordSignIn({ onUseCode }: { onUseCode?: () => void }) {
  const [state, formAction, pending] = useActionState(loginAction, initialLogin);

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

      <PasswordField
        label="Password"
        htmlFor="password"
        name="password"
        error={state.fieldErrors?.password?.[0]}
        required
        aria-invalid={Boolean(state.fieldErrors?.password)}
      />

      <RememberCheckbox defaultChecked />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {onUseCode && <SwitchLink onClick={onUseCode}>Email me a code instead</SwitchLink>}

      <p className="mt-4 text-center text-[13.5px]">
        <Link href="/admin/forgot-password" className="font-semibold text-brand-ink hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------- shared */

/**
 * Checked by default, which is what every session did before this checkbox
 * existed. Unticking it makes the cookie a session cookie, so closing the
 * browser signs this machine out — the question someone borrowing a
 * workstation is actually asking. The token's own 14-day life is unchanged
 * either way.
 */
function RememberCheckbox({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="mb-5 -mt-1 flex items-center gap-2.5 text-[13.5px] text-muted">
      <input
        type="checkbox"
        name="remember"
        value="1"
        defaultChecked={defaultChecked}
        className="size-4 shrink-0 accent-brand-600"
      />
      Keep me signed in on this device
    </label>
  );
}

function SwitchLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <p className="mt-4 text-center text-[13.5px]">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-[24px] items-center font-semibold text-brand-ink hover:underline"
      >
        {children}
      </button>
    </p>
  );
}
