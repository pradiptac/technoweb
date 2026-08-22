"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { changeStaffPassword } from "@/lib/admin-auth";

export type ProfileState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

export async function changePasswordAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    await changeStaffPassword({
      current_password: String(formData.get("current_password") ?? ""),
      password: String(formData.get("password") ?? ""),
      password_confirmation: String(formData.get("password_confirmation") ?? ""),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/admin/login");
      if (error.status === 422) {
        return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      }
    }
    return { error: "We could not change the password. Try again shortly." };
  }

  revalidatePath("/admin/profile");
  return { ok: true };
}
