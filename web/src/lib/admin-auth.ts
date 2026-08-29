import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { AdminAuthResponse, StaffUser } from "@/types/api";

const COOKIE = "tw_admin_session";

/**
 * Staff session handling — separate cookie from the customer portal's
 * tw_session, since a staff user and a customer are never the same
 * principal. Same shape as lib/auth.ts otherwise: the Sanctum token is
 * httpOnly, so client JavaScript can never read it.
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
 * signing in on a shared workstation is actually answering. A "remember me"
 * that changed nothing would be worse than not offering one.
 *
 * The default is true, matching what every session did before the checkbox
 * existed: making it opt-in would quietly start logging the whole team out
 * every evening, and that reads as a bug rather than as a policy.
 */
async function setToken(token: string, remember: boolean) {
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

/** Deduped per-request lookup of the signed-in staff member, or null. */
export const getCurrentStaff = cache(async (): Promise<StaffUser | null> => {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await apiFetch<{ data: StaffUser }>("/admin/auth/me", { token });
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
});

export async function login(email: string, password: string, remember = true): Promise<StaffUser> {
  const res = await apiFetch<AdminAuthResponse>("/admin/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setToken(res.token, remember);
  return res.staff;
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    await apiFetch<void>("/admin/auth/logout", { method: "POST", token }).catch(() => {});
  }
  await clearToken();
}

/* ---------------------------------------------------------- sign-in codes */

/**
 * The console's codes, which are a different secret from the portal's.
 *
 * Two endpoints rather than one with an audience parameter, so there is no
 * value on the wire that could be got wrong: a code minted for the portal is
 * refused here by the API regardless of what this file sends.
 *
 * `remember` behaves exactly as it does for a password sign-in — it decides
 * how long this machine holds the cookie, not how long the token lives.
 */
export async function requestStaffSignInCode(email: string): Promise<void> {
  await apiFetch<{ message: string }>("/admin/auth/request-code", {
    method: "POST",
    body: { email },
  });
}

export async function signInStaffWithCode(
  email: string,
  code: string,
  remember = true,
): Promise<StaffUser> {
  const res = await apiFetch<AdminAuthResponse>("/admin/auth/verify-code", {
    method: "POST",
    body: { email, code },
  });
  await setToken(res.token, remember);
  return res.staff;
}

/* ------------------------------------------------------- password recovery */

/**
 * These three are unauthenticated by design, so they take no token.
 *
 * The API answers a forgot-password request identically whether or not the
 * address exists — see ResetsPasswords on the server. The UI must not try to
 * be more helpful than that, or it re-opens the enumeration hole the API is
 * closing.
 */
export async function requestStaffPasswordReset(email: string): Promise<void> {
  await apiFetch<{ message: string }>("/admin/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function resetStaffPassword(input: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await apiFetch<{ message: string }>("/admin/auth/reset-password", {
    method: "POST",
    body: input,
  });
}

/** Changing your own password while signed in. Every staff role may do this. */
export async function changeStaffPassword(input: {
  current_password: string;
  password: string;
  password_confirmation: string;
}): Promise<void> {
  await apiFetch<{ message: string }>("/admin/auth/password", {
    method: "PATCH",
    body: input,
    token: await getToken(),
  });
}
