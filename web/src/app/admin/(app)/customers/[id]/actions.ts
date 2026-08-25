"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  approveCustomer, rejectCustomer, resendCustomerVerificationEmail,
  setCustomerStatus, updateCustomer,
} from "@/lib/admin";

export type CustomerActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Every action here answers the same way, so the screen has one thing to render.
 *
 * **Success redirects; failure returns.** The buttons on this screen are
 * conditional on the very status they change — `Activate` renders only while
 * an account is pending — so on success the component that owns the action
 * state unmounts, and a success message returned into it is destroyed before
 * anybody reads it. That is not theory: the first browser run approved an
 * account and reported nothing at all.
 *
 * A failure changes no status, so the button is still mounted and returning
 * the error into it works — and keeps it beside the control that failed.
 */
async function run(
  id: number,
  work: () => Promise<unknown>,
  done: string,
): Promise<CustomerActionState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 403) return { error: "Your account cannot make that change." };
    }
    return { error: "We could not reach the admin API. Nothing has been changed." };
  }

  // The list carries a pending count in its header and a queue ordering that
  // both depend on this row, so it is revalidated alongside the detail page.
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");

  // redirect() throws by design — outside the catch above.
  redirect(`/admin/customers/${id}?done=${done}`);
}

export async function approveAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  return run(id, () => approveCustomer(id), "approved");
}

export async function rejectAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();

  return run(
    id,
    () => rejectCustomer(id, note || undefined),
    "rejected",
  );
}

export async function suspendAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();

  return run(
    id,
    () => setCustomerStatus(id, "suspended", note || undefined),
    "suspended",
  );
}

export async function reactivateAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  return run(id, () => setCustomerStatus(id, "active"), "reactivated");
}

export async function resendAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  return run(id, () => resendCustomerVerificationEmail(id), "resent");
}

export async function saveDetailsAction(
  _prev: CustomerActionState, formData: FormData,
): Promise<CustomerActionState> {
  const id = Number(formData.get("id"));
  const value = (key: string) => String(formData.get(key) ?? "").trim();

  return run(
    id,
    () => updateCustomer(id, {
      name: value("name"),
      email: value("email"),
      company: value("company") || null,
      phone: value("phone") || null,
    }),
    "saved",
  );
}
