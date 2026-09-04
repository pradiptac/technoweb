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

  const body: Record<string, unknown> = {};
  for (const key of ["name", "company", "phone", "email", "current_password", "password", "password_confirmation"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") body[key] = value;
  }

  /*
   * The addresses, and the one question that decides whether there are two.
   *
   * Read from the form every time this screen submits, so clearing a field
   * clears it — unlike the plain fields above, where an empty string means
   * "unchanged". That difference is deliberate and it is why these are built
   * separately: a person who has moved must be able to *delete* the old
   * address, and a loop that skips empty values could never let them.
   *
   * `shipping_same` is the tick box, never a comparison of the two blocks. Two
   * addresses that match today are still two answers, and the account stores
   * the answer — the rule the checkout follows.
   */
  const address = (prefix: string) => {
    const part = (field: string) => {
      const value = formData.get(`${prefix}${field}`);
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    };

    return {
      line1: part("line1"), line2: part("line2"), city: part("city"),
      state: part("state"), pin: part("pin"), country: part("country"),
    };
  };

  const elsewhere = formData.get("ship_elsewhere") === "1";

  body.billing_address = address("");
  body.shipping_same = !elsewhere;
  if (elsewhere) body.shipping_address = address("ship_");

  // A GSTIN is cleared by emptying the box, so null rather than omitted.
  const gstin = formData.get("gstin");
  body.gstin = typeof gstin === "string" && gstin.trim() !== "" ? gstin.trim().toUpperCase() : null;

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
