"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";

export type ProfileState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const token = await getToken();
  if (!token) redirect("/portal/login");

  const body: Record<string, string> = {};
  for (const key of ["name", "company", "phone", "email", "current_password", "password", "password_confirmation"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") body[key] = value;
  }

  // Don't send a half-filled password change to the API.
  if (body.password && !body.current_password) {
    return { error: "Enter your current password to set a new one.", fieldErrors: { current_password: ["Required."] } };
  }

  try {
    await apiFetch("/auth/profile", { method: "PATCH", body, token });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 401) redirect("/portal/login");
    }
    return { error: "We could not save your changes. Try again shortly." };
  }

  revalidatePath("/portal/profile");
  return { ok: true };
}
