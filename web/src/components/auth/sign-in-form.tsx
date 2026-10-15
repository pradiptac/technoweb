"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { ResendButton } from "@/app/portal/register/check-your-email/resend-button";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input } from "@/components/ui/input";
import { PasswordField } from "@/components/ui/password-field";
import { useStoreCredentialOnSuccess } from "@/lib/credential-store";

/**
 * The sign-in form both doors share — the customer portal's and the
 * console's.
 *
 * They were two files of the same three hundred lines (2026-09-18: the
 * portal's had been "built from" the admin's, and the two had drifted by
 * a refusal panel and a register link). What differs between the doors
 * is data — the three Server Actions, the forgot-password path, whether
 * registration is offered — and arrives as props; what the form *is*
 * lives once.
 *
 * The code is the default and the password is a link away, which is the
 * decision this component exists to express. Both are rendered here rather
 * than by two routes, so the switch costs no navigation and nothing typed
 * is lost on the way. Which of the two is offered at all comes from
 * settings, read on the server — an install can turn either off, and
 * turning off passwords is a decision with a lockout behind it if mail
 * then breaks, which is why they are separate switches rather than one
 * three-way choice. For the console, codes being the default is the more
 * consequential of the two: whoever can read a staff mailbox can sign in
 * as that person, where a password sign-in needed the mailbox *and*
 * something known. It is reversible from Settings without a deploy —
 * `otp_admin_login_enabled` — which is why the choice is a prop.
 */

/** What either door's actions answer with; the console's never sets `reason` or `email`, and both are optional. */
export type SignInState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Why a login with the right password was refused, when the API says — branch on this, never on `error`'s wording. */
  reason?: string;
  email?: string;
};

export type SignInCodeState = SignInState & {
  /** Which half of the form to render. */
  step: "email" | "code";
  /** True once a code has gone out, so the screen can say so. */
  sent?: boolean;
  /** Carried across the two steps, since the code form asks for it again. */
  remember?: boolean;
};

type Action<S> = (prev: S, formData: FormData) => Promise<S>;

export type SignInActions = {
  login: Action<SignInState>;
  sendCode: Action<SignInCodeState>;
  verifyCode: Action<SignInCodeState>;
};

const initialLogin: SignInState = {};

/*
  Two starting states, and the difference matters.

  The verify action's state starts on "code" so that its own value is only
  ever consulted for what it says about a *failed* verification — it moves to
  "email" only when the address went missing, which is the one case that has
  to send somebody back to the start. Starting it on "email" would make the
  screen refuse to advance at all, since the two states are read together.
*/
const initialSend: SignInCodeState = { step: "email" };
const initialVerify: SignInCodeState = { step: "code" };

export function SignInForm({
  actions,
  forgotHref,
  registerHref,
  otpEnabled = true,
  passwordEnabled = true,
  defaultMethod = "otp",
  returnTo,
  before,
}: {
  actions: SignInActions;
  /**
   * Drawn above whichever method is showing — the portal's "Continue with
   * Google". Rendered by the server and handed in, so this client module
   * knows nothing about it; the console passes nothing.
   */
  before?: ReactNode;
  /** Where "Forgot your password?" goes — each door has its own reset. */
  forgotHref: string;
  /**
   * Where to register, when the door offers it. A short link is rendered
   * below whichever method is showing — registering is orthogonal to how
   * you sign in, so it would otherwise be written twice, once per mode.
   */
  registerHref?: string;
  otpEnabled?: boolean;
  passwordEnabled?: boolean;
  /** Which step this opens on, from settings. The other is always a link away. */
  defaultMethod?: "otp" | "password";
  /**
   * Where to go once signed in, posted as `return` and checked again by the
   * action (`safeReturnPath`) — a hidden field is a request body, and a
   * request body is not a promise.
   */
  returnTo?: string;
}) {
  /*
   * The default, then what is actually possible.
   *
   * An install can name a default whose route has since been switched off —
   * codes as the default with mail broken, or passwords as the default on an
   * install that has turned them off — and opening on a step that cannot work
   * is a sign-in screen nobody can use. So the preference is honoured only
   * where it is available, and the fallback is whatever is left.
   */
  const opening: "code" | "password" =
    defaultMethod === "password"
      ? (passwordEnabled ? "password" : "code")
      : (otpEnabled ? "code" : "password");

  const [mode, setMode] = useState<"code" | "password">(opening);

  const registerLink = registerHref && (
    <p className="mt-6 text-center text-13-5 text-muted">
      Don&apos;t have an account?{" "}
      <Link href={registerHref} className="font-semibold text-brand-ink hover:underline">
        Register
      </Link>
    </p>
  );

  if (mode === "password" || !otpEnabled) {
    return (
      <>
        {before}
        <PasswordSignIn action={actions.login} forgotHref={forgotHref} returnTo={returnTo} onUseCode={otpEnabled ? () => setMode("code") : undefined} />
        {registerLink}
      </>
    );
  }

  return (
    <>
      {before}
      <CodeSignIn actions={actions} returnTo={returnTo} onUsePassword={passwordEnabled ? () => setMode("password") : undefined} />
      {registerLink}
    </>
  );
}

/* ------------------------------------------------------------ by a code */

function CodeSignIn({ actions, onUsePassword, returnTo }: { actions: SignInActions; onUsePassword?: () => void; returnTo?: string }) {
  /*
    Two actions, two forms, one state each — rather than one action switching
    on a hidden `intent`.

    The step lives in the action's own state and never in the URL: an address
    in a query string ends up in browser history, in a screenshot of the tab,
    and in whatever the next person to use the machine sees in the address bar.
    A refresh returns to step one, which is the right answer for a flow whose
    every step is one button press.
  */
  const [sent, sendAction, sending] = useActionState(actions.sendCode, initialSend);
  const [verified, verifyAction, verifying] = useActionState(actions.verifyCode, initialVerify);

  const email = verified.email ?? sent.email;
  const remember = verified.remember ?? sent.remember ?? true;
  const onCodeStep = sent.step === "code" && verified.step === "code";

  if (!onCodeStep) {
    return (
      <Form action={sendAction} state={sent} noValidate>
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
      </Form>
    );
  }

  return (
    <>
      <Form action={verifyAction} state={verified} noValidate>
        {returnTo && <input type="hidden" name="return" value={returnTo} />}
        <Refusal state={verified} />

        {/*
          An Alert and not a toast: this is part of what the screen says while
          the code is being typed, and a message that slides away after five
          seconds is one somebody reads half of on the way to their inbox.

          Shown alongside an error rather than instead of one. Both are true at
          once after a resend — the last code was refused *and* a new one is on
          its way — and hiding this one there leaves somebody who has just
          pressed "send a new code" looking at nothing but the old failure.
        */}
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
      </Form>

      {/*
        A second form rather than a second button inside the first: this posts
        to a different action, and a form with two destinations needs
        JavaScript to decide between them. Still offered after a successful
        send, because "it has not arrived" is the entire situation it exists
        for.
      */}
      <Form action={sendAction} state={sent} className="mt-3">
        <input type="hidden" name="email" value={email ?? ""} />
        {remember && <input type="hidden" name="remember" value="1" />}
        <Button type="submit" variant="secondary" disabled={sending} className="w-full">
          {sending ? "Sending…" : "Send a new code"}
        </Button>
      </Form>

      {onUsePassword && <SwitchLink onClick={onUsePassword}>Use your password instead</SwitchLink>}
    </>
  );
}

/* -------------------------------------------------------- by a password */

function PasswordSignIn({ action, forgotHref, onUseCode, returnTo }: { action: Action<SignInState>; forgotHref: string; onUseCode?: () => void; returnTo?: string }) {
  const [state, formAction, pending] = useActionState(action, initialLogin);

  /*
    What was typed, kept for the credential store — see the hook, which
    explains why a Server Action sign-in has to tell the browser out loud that
    it happened. Refs rather than state: nothing renders from these, and a
    keystroke that re-rendered the form would be a keystroke that cost a
    render on every letter of a password.
  */
  const submitted = useRef<{ email: string; password: string } | null>(null);

  useStoreCredentialOnSuccess(() =>
    submitted.current
      ? { ...submitted.current, failed: Boolean(state.error || state.fieldErrors) }
      : null,
  );

  return (
    <Form
      action={formAction}
      state={state}
      noValidate
      onSubmit={(e) => {
        const form = e.currentTarget;
        submitted.current = {
          email: (form.elements.namedItem("email") as HTMLInputElement)?.value ?? "",
          password: (form.elements.namedItem("password") as HTMLInputElement)?.value ?? "",
        };
      }}
    >
      <Refusal state={state} />
      {returnTo && <input type="hidden" name="return" value={returnTo} />}

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

      <Button type="submit" pending={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {/*
        Two alternatives to typing a password, given equal weight rather than
        one reading as the "real" option and the other a footnote below it —
        which is what a stacked list of the two read as. Split to opposite
        ends of one row: switching to a code is offered on the left only when
        that route is switched on, and forgetting the password you have is
        offered on the right regardless.
      */}
      <div className="mt-4 flex items-center justify-between text-13-5">
        {onUseCode && (
          <button
            type="button"
            onClick={onUseCode}
            className="inline-flex min-h-[24px] items-center font-semibold text-brand-ink hover:underline"
          >
            Email me a code instead
          </button>
        )}
        <Link href={forgotHref} className="inline-flex min-h-[24px] items-center font-semibold text-brand-ink hover:underline">
          Forgot your password?
        </Link>
      </div>
    </Form>
  );
}

/* ------------------------------------------------------------- shared */

/**
 * Three different refusals, three different screens.
 *
 * "Waiting for approval" is not an error the person can act on, so it is an
 * info panel with nothing to press — offering a button there would be
 * pretending they had a move to make. "Confirm your address" is the opposite:
 * it is entirely actionable, and the resend lives right beside the message
 * rather than a page away. The console's actions never set `reason`, so
 * there this is the plain refusal every time.
 *
 * Shared between both ways in because the API answers both identically, and
 * the one branch that cannot arrive from a code — `email_unverified`, since a
 * delivered code confirms the address on the way past — costs nothing to leave
 * in and would be a real hole to leave out of the password path.
 */
function Refusal({ state }: { state: SignInState }) {
  if (state.reason === "pending_approval") {
    return (
      <Alert tone="info" title="Your account is not live yet">
        {state.error} Nothing more is needed from you.
      </Alert>
    );
  }

  if (state.reason === "email_unverified") {
    return (
      <>
        <Alert tone="warn" title="Confirm your address first">{state.error}</Alert>
        {state.email && <ResendButton email={state.email} />}
      </>
    );
  }

  return state.error ? <Alert tone="err" title="Could not sign you in">{state.error}</Alert> : null;
}

/**
 * Checked by default, which is what every session did before this checkbox
 * existed. Unticking it makes the cookie a session cookie, so closing the
 * browser signs this machine out — the question someone on a shared machine
 * is actually asking. The token's own 14-day life is unchanged either way.
 */
function RememberCheckbox({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label className="mb-5 -mt-1 flex items-center gap-2.5 text-13-5 text-muted">
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

/**
 * The switch between the two ways in.
 *
 * A button rather than a link, because it changes what this screen shows and
 * navigates nowhere — and one styled as a link, because that is what it does
 * for the reader. `min-h-[24px]` keeps it clear of the tap-target floor the
 * audit enforces.
 */
function SwitchLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <p className="mt-4 text-center text-13-5">
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
