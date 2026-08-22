"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createStaff, deleteStaff, updateStaff, type StaffPayload } from "@/lib/admin";
import { str } from "@/lib/admin-form";

export type StaffFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Shown once after a create; the API cannot return it again. */
  generatedPassword?: string;
  createdName?: string;
};

function payloadFrom(formData: FormData): StaffPayload {
  const password = str(formData, "password");

  return {
    name: str(formData, "name") ?? "",
    email: str(formData, "email") ?? "",
    is_active: formData.get("is_active") === "1",
    roles: formData.getAll("roles").map(String).filter(Boolean),
    // Absent means "leave it alone" on update, and "generate one" on create.
    ...(password ? { password } : {}),
  };
}

function toState(error: unknown): StaffFormState {
  if (error instanceof ApiError) {
    if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
    if (error.status === 401) redirect("/admin/login");
    if (error.status === 403) return { error: "Only an administrator can manage staff accounts." };
  }
  return { error: "We could not save the account. Try again shortly." };
}

/**
 * Create does not redirect.
 *
 * A generated password comes back exactly once and is unrecoverable
 * afterwards, so navigating away from it would lose it. The form stays put and
 * shows it until the administrator moves on deliberately.
 */
export async function createStaffAction(_p: StaffFormState, formData: FormData): Promise<StaffFormState> {
  try {
    const created = await createStaff(payloadFrom(formData));
    revalidatePath("/admin/users");

    return created.generated_password
      ? { generatedPassword: created.generated_password, createdName: created.name }
      : { createdName: created.name };
  } catch (error) {
    return toState(error);
  }
}

export async function updateStaffAction(_p: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const id = Number(formData.get("id"));
  if (!id) return { error: "Missing staff id." };

  try { await updateStaff(id, payloadFrom(formData)); }
  catch (error) { return toState(error); }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?saved=1`);
}

export async function deleteStaffAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await deleteStaff(id);
  } catch {
    // The API refuses to delete the last administrator or your own account.
    // Falling through to the list rather than swallowing it silently: the
    // account will still be there, which is the answer.
    redirect(`/admin/users/${id}?blocked=1`);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?deleted=1");
}
