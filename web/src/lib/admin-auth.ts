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

export async function login(email: string, password: string): Promise<StaffUser> {
  const res = await apiFetch<AdminAuthResponse>("/admin/auth/login", {
    method: "POST",
    body: { email, password },
  });
  await setToken(res.token);
  return res.staff;
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    await apiFetch<void>("/admin/auth/logout", { method: "POST", token }).catch(() => {});
  }
  await clearToken();
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
