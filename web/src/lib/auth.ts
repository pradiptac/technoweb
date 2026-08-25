import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { AuthResponse, Customer } from "@/types/api";

const COOKIE = "tw_session";

/**
 * Customer session handling.
 *
 * The Sanctum token is stored in an httpOnly, sameSite=lax cookie so client
 * JavaScript can never read it. Every authenticated request is issued from the
 * server with the token attached — the browser talks to Next, Next talks to Laravel.
 */

export async function getToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value;
}

async function setToken(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
}

export async function clearToken() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Deduped per-request lookup of the signed-in customer, or null. */
export const getCurrentCustomer = cache(async (): Promise<Customer | null> => {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await apiFetch<{ data: Customer }>("/auth/me", { token });
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

export async function login(email: string, password: string): Promise<Customer> {
  const res = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setToken(res.token);
  return res.customer;
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    await apiFetch<void>("/auth/logout", { method: "POST", token }).catch(() => {});
  }
  await clearToken();
}

/* ------------------------------------------------------- password recovery */

/** See the note in admin-auth.ts — the response is deliberately uninformative. */
export async function requestCustomerPasswordReset(email: string): Promise<void> {
  await apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function resetCustomerPassword(input: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: input,
  });
}

/* ------------------------------------------------------- self-registration */

/**
 * Register, confirm and resend.
 *
 * All three answer identically whether or not the address is known — that is
 * the API's doing, and nothing here may undo it by reporting a difference the
 * server went out of its way not to make. A caller that catches an error and
 * says "that address is already registered" reintroduces the whole leak.
 */
export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  company?: string;
  phone?: string;
  website?: string;
}): Promise<void> {
  await apiFetch<{ message: string }>("/auth/register", { method: "POST", body: input });
}

export type VerifyResult = {
  message: string;
  status: string;
  already_verified: boolean;
};

export async function verifyCustomerEmail(email: string, token: string): Promise<VerifyResult> {
  return apiFetch<VerifyResult>("/auth/verify-email", {
    method: "POST",
    body: { email, token },
  });
}

export async function resendCustomerVerification(email: string): Promise<void> {
  await apiFetch<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: { email },
  });
}
