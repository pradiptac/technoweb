"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/auth";

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

  if (!email || !password) {
    return { error: "Enter both your email address and password." };
  }

  try {
    await login(email, password);
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
