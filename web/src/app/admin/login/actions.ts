"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { login } from "@/lib/admin-auth";

export type LoginState = { error?: string; fieldErrors?: Record<string, string[]> };

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
      if (error.status === 403) return { error: "This staff account has been deactivated." };
      if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    }
    return { error: "We could not reach the admin system. Try again shortly." };
  }

  // redirect() throws by design — keep it outside the try block's catch path.
  redirect("/admin");
}
