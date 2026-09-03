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

/**
 * `remember` is the difference between a cookie that outlives the browser and
 * one that does not.
 *
 * Omitting maxAge makes it a session cookie, which the browser discards when
 * it closes. The Sanctum token stays valid for its full 14 days either way —
 * this decides how long *this machine* holds it, which is the question someone
 * signing in on a shared workstation is actually answering. Same rule
 * admin-auth.ts follows for staff; the default here is also true, matching
 * what every session did before the checkbox existed.
 */
async function setToken(token: string, remember = true) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 14 } : {}), // 14 days, or this session
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

export async function login(email: string, password: string, remember = true): Promise<Customer> {
  const res = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setToken(res.token, remember);
  return res.customer;
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    await apiFetch<void>("/auth/logout", { method: "POST", token }).catch(() => {});
  }
  await clearToken();
}

/* ---------------------------------------------------------- sign-in codes */

/**
 * Ask for a one-time code, and sign in with one.
 *
 * The request answers 202 with the same sentence whether or not the address
 * has an account behind it, which is the API's doing — and nothing here may
 * undo it by reporting a difference the server went out of its way not to
 * make. The same rule the registration calls above are annotated with.
 */
export async function requestSignInCode(email: string): Promise<void> {
  await apiFetch<{ message: string }>("/auth/request-code", {
    method: "POST",
    body: { email },
  });
}

export async function signInWithCode(email: string, code: string, remember = true): Promise<Customer> {
  const res = await apiFetch<AuthResponse>("/auth/verify-code", {
    method: "POST",
    body: { email, code },
  });
  await setToken(res.token, remember);
  return res.customer;
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

/**
 * The signed-in customer, or null — **including when the API cannot be reached
 * at all**.
 *
 * `getCurrentCustomer()` deliberately rethrows anything that is not a 401 or 403: inside the
 * console a backend failure must surface rather than quietly read as "signed
 * out". The sign-in page is the one place where that is exactly wrong. It uses
 * the check only to avoid showing the form to somebody who is already signed
 * in, and a stale cookie — these last fourteen days — turned an unreachable API
 * into a **500 on the sign-in page itself**, which is the one page somebody
 * opens to find out what is broken.
 *
 * Measured, against the built app pointed at a dead API: no cookie answered
 * 200 and a stale cookie answered 500, while the public site degraded to 200
 * as it is designed to. Falling back to "not signed in" renders the form,
 * which is the safe answer to a question that could not be asked.
 */
export async function getCurrentCustomerOrNull(): Promise<Customer | null> {
  try {
    return await getCurrentCustomer();
  } catch {
    return null;
  }
}
