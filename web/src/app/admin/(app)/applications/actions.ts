"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { deleteJobApplication, setApplicationStatus } from "@/lib/admin";

export type ApplicationState = { error?: string };

/**
 * Success redirects; failure returns.
 *
 * The same rule the customer screen follows, and for the same reason: the
 * controls here are conditional on the status they change, so a success
 * message returned into one of them is destroyed by its own success.
 */
export async function setStatusAction(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  try {
    await setApplicationStatus(id, status, note || undefined);
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) return { error: error.message };
    return { error: "We could not reach the admin API. Nothing was changed." };
  }

  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/applications");
  redirect(`/admin/applications/${id}?done=status`);
}

/**
 * Deleting a candidate's record, CV included.
 *
 * Somebody who applied has no account to come back and remove themselves, so
 * "please delete my details" has to be something staff can act on.
 */
export async function deleteApplicationAction(formData: FormData): Promise<void> {
  await deleteJobApplication(Number(formData.get("id")));
  revalidatePath("/admin/applications");
  redirect("/admin/applications?done=application-deleted");
}
