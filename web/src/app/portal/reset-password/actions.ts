"use server";

import { ApiError } from "@/lib/api";
import { resetCustomerPassword } from "@/lib/auth";
import type { ResetState } from "@/components/forms/reset-password-form";

export async function resetCustomerPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const payload = {
    token: String(formData.get("token") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    password_confirmation: String(formData.get("password_confirmation") ?? ""),
  };

  try {
    await resetCustomerPassword(payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return {
        error: error.errors?.token?.[0] ?? "Check the highlighted fields.",
        fieldErrors: error.errors,
      };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { error: "Too many attempts. Wait a minute and try again." };
    }
    return { error: "We could not reset the password. Request a new link." };
  }

  return { done: true };
}
