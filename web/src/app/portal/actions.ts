"use server";

import { redirect } from "next/navigation";
import { getCurrentCustomer, logout } from "@/lib/auth";

export async function logoutAction() {
  await logout();
  redirect("/portal/login");
}

/**
 * End a staff member's "View as" session.
 *
 * The same revoke-and-clear as signing out — the impersonation is its own
 * token, so `/auth/logout` deletes only it — and then a redirect to the
 * customer's record in the console, **never `window.close()`**: script may
 * close only a tab whose history holds one entry, and this one has been
 * browsed. The admin cookie is a different cookie and is still in the
 * browser, so the tab lands signed in, with a toast.
 */
export async function endImpersonationAction() {
  const customer = await getCurrentCustomer();
  await logout();
  redirect(customer ? `/admin/customers/${customer.id}?done=impersonation-ended` : "/admin/customers");
}
