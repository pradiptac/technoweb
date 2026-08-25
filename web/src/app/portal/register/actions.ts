"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { registerCustomer, resendCustomerVerification } from "@/lib/auth";

export type RegisterState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const value = (key: string) => String(formData.get(key) ?? "").trim();

  const email = value("email");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  if (!value("name") || !email || !password) {
    return { error: "Fill in your name, email address and a password." };
  }

  // Checked here as well as on the server, purely so the answer is instant.
  // The server rule is the one that counts.
  if (password !== confirmation) {
    return { fieldErrors: { password_confirmation: ["The two passwords do not match."] } };
  }

  try {
    await registerCustomer({
      name: value("name"),
      email,
      password,
      password_confirmation: confirmation,
      company: value("company") || undefined,
      phone: value("phone") || undefined,
      // The honeypot travels with the rest. A bot fills it; a person never
      // sees it.
      website: value("website") || undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 403) return { error: error.message };
      if (error.status === 429) {
        return { error: "Too many attempts from this connection. Wait a minute and try again." };
      }
    }
    return { error: "We could not reach the support system. Try again shortly." };
  }

  // The address is carried through so the next screen can offer a resend, and
  // nothing more — it is not a session and grants nothing.
  redirect(`/portal/register/check-your-email?email=${encodeURIComponent(email)}`);
}

export type ResendState = { sent?: boolean; error?: string };

export async function resendAction(_prev: ResendState, formData: FormData): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) return { error: "We do not have an address to send to." };

  try {
    await resendCustomerVerification(email);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { error: "That has been asked for a few times already. Wait a minute." };
    }
    return { error: "We could not reach the support system. Try again shortly." };
  }

  // Always reported as sent, because the API always answers as though it was.
  // Saying anything else here would leak what it refuses to.
  return { sent: true };
}
