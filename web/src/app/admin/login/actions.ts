"use server";

import { redirect } from "next/navigation";
import { landingFor } from "@/lib/admin-landing";
import { ApiError } from "@/lib/api";
import { login, requestStaffSignInCode, signInStaffWithCode } from "@/lib/admin-auth";

export type LoginState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // An unchecked checkbox is absent from FormData entirely, so this reads as
  // false — which is the answer someone on a shared machine wants it to be.
  const remember = formData.get("remember") === "1";

  if (!email || !password) {
    return { error: "Enter both your email address and password." };
  }

  let staff;

  try {
    staff = await login(email, password, remember);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 401) return { error: "That email and password combination was not recognised." };
      if (error.status === 403) return { error: "This staff account has been deactivated." };
      if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    }
    return { error: "We could not reach the admin system. Try again shortly." };
  }

  // redirect() throws by design — keep it outside the try block's catch path.
  redirect(landingFor(staff.roles.map((r) => r.slug)));
}

/* ---------------------------------------------------------- sign-in codes */

export type CodeState = LoginState & {
  step: "email" | "code";
  email?: string;
  sent?: boolean;
  /** Carried across the two steps, since the code form asks for it again. */
  remember?: boolean;
};

/**
 * Ask for a code.
 *
 * It advances to the code step whatever the answer was, short of the site
 * being unreachable. The API cannot say whether an address belongs to a staff
 * account — these are the handful of people who can edit the site, and an
 * endpoint that distinguishes them is a way to find out who they are — so a
 * form that only advanced for addresses it recognised would give away exactly
 * what the API withholds.
 */
export async function sendCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const remember = formData.get("remember") === "1";

  if (!email) {
    return { step: "email", error: "Enter your email address." };
  }

  try {
    await requestStaffSignInCode(email);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { step: "email", email, remember, error: error.message, fieldErrors: error.errors };
      if (error.status === 403) return { step: "email", email, remember, error: error.message };
      if (error.status === 429) {
        return { step: "email", email, remember, error: "Too many requests. Wait a minute and try again." };
      }
    }
    return { step: "email", email, remember, error: "We could not reach the admin system. Try again shortly." };
  }

  return { step: "code", email, remember, sent: true };
}

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

  let staff;

  try {
    staff = await signInStaffWithCode(email, code, remember);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { step: "code", email, remember, error: error.message, fieldErrors: error.errors };
      if (error.status === 403) return { step: "code", email, remember, error: "This staff account has been deactivated." };
      if (error.status === 429) {
        return { step: "code", email, remember, error: "Too many attempts. Wait a minute and try again." };
      }
    }
    return { step: "code", email, remember, error: "We could not reach the admin system. Try again shortly." };
  }

  redirect(landingFor(staff.roles.map((r) => r.slug)));
}
