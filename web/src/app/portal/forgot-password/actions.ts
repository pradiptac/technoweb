"use server";

import { ApiError } from "@/lib/api";
import { requestCustomerPasswordReset } from "@/lib/auth";
import type { ForgotState } from "@/components/forms/forgot-password-form";

export async function requestCustomerResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email address you sign in with." };

  try {
    await requestCustomerPasswordReset(email);
  } catch (error) {
    // A 429 is the only failure worth naming: it is the one the person can do
    // something about. Everything else reports success, because the API
    // already refuses to say whether the address exists and the UI must not
    // undo that.
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Too many attempts. Wait a minute and try again." };
    }
    if (error instanceof ApiError && error.status === 422) {
      return { error: "That does not look like an email address." };
    }
    return { sent: true };
  }

  return { sent: true };
}
