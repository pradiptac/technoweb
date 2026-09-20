"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { login, requestSignInCode, signInWithCode } from "@/lib/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Why a login with the right password was refused, when the API says.
   *
   * Branching on this rather than on `error` — the message is written to be
   * read by a person and will be reworded, and a screen that changes shape
   * when somebody fixes a typo in a sentence is a screen nobody can maintain.
   */
  reason?: string;
  /** Echoed back so the "resend" offer has an address to send to. */
  email?: string;
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // An unchecked checkbox is absent from FormData entirely, so this reads as
  // false — the answer someone on a shared machine wants it to be.
  const remember = formData.get("remember") === "1";

  if (!email || !password) {
    return { error: "Enter both your email address and password." };
  }

  try {
    await login(email, password, remember);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 401) return { error: "That email and password combination was not recognised." };
      // The password was right; the account is not usable yet. Distinct
      // screens, so the reason travels with the message.
      if (error.status === 403) return { error: error.message, reason: error.reason, email };
      if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    }
    return { error: "We could not reach the support system. Try again shortly." };
  }

  // redirect() throws by design — keep it outside the try block's catch path.
  redirect("/portal");
}

/* ---------------------------------------------------------- sign-in codes */

export type CodeState = LoginState & {
  /** Which half of the form to render. */
  step: "email" | "code";
  /** True once a code has gone out, so the screen can say so. */
  sent?: boolean;
  /** Carried across the two steps, since the code form asks for it again. */
  remember?: boolean;
};

/**
 * Ask for a code.
 *
 * **It moves to the code step whatever happened**, short of the site being
 * unreachable — including for an address with no account. The API answers
 * identically either way on purpose, and a form that only advanced for
 * addresses it recognised would hand back exactly the fact the API is
 * refusing to give: submit addresses, watch which ones move on, and you have a
 * list of this company's customers.
 */
export async function sendCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const remember = formData.get("remember") === "1";

  if (!email) {
    return { step: "email", error: "Enter your email address." };
  }

  try {
    await requestSignInCode(email);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { step: "email", email, remember, error: error.message, fieldErrors: error.errors };
      // Codes have been switched off since this page was rendered.
      if (error.status === 403) return { step: "email", email, remember, error: error.message };
      if (error.status === 429) {
        return { step: "email", email, remember, error: "Too many requests. Wait a minute and try again." };
      }
    }
    return { step: "email", email, remember, error: "We could not reach the support system. Try again shortly." };
  }

  return { step: "code", email, remember, sent: true };
}

/**
 * Spend a code.
 *
 * A refusal here is the same refusal a password sign-in gets, with the same
 * `reason`, so the three screens below it do not have to know which way in was
 * used. One branch cannot arrive: an unconfirmed address is confirmed by the
 * code itself, server-side.
 */
export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const remember = formData.get("remember") === "1";

  if (!email) {
    return { step: "email", error: "Start again — we lost track of your address." };
  }

  if (!code) {
    return { step: "code", email, remember, error: "Enter the code we sent you." };
  }

  try {
    await signInWithCode(email, code, remember);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { step: "code", email, remember, error: error.message, fieldErrors: error.errors };
      if (error.status === 403) return { step: "code", email, remember, error: error.message, reason: error.reason };
      if (error.status === 429) {
        return { step: "code", email, remember, error: "Too many attempts. Wait a minute and try again." };
      }
    }
    return { step: "code", email, remember, error: "We could not reach the support system. Try again shortly." };
  }

  redirect("/portal");
}
