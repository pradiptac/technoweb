"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { mergeTicket, replyToTicket } from "@/lib/admin";

export type ReplyState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

export async function replyAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const reference = String(formData.get("reference") ?? "");
  if (!reference) return { error: "Missing ticket reference." };

  try {
    const files = formData.getAll("attachments").filter(
      (f): f is File => f instanceof File && f.size > 0,
    );
    formData.delete("attachments");
    formData.delete("reference");
    files.forEach((f) => formData.append("attachments[]", f));

    await replyToTicket(reference, formData);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 401) redirect("/admin/login");
    }
    return { error: "We could not post your reply. Try again shortly." };
  }

  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath("/admin/tickets");
  revalidatePath("/admin");
  return { ok: true };
}

export type MergeState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Merge this ticket into another. The typed reference wins over the pick,
 * because typing one is the more deliberate act. `redirect()` stays outside
 * the `try`: it throws to work, and a catch that swallowed it would report
 * a merge that had already happened as a failure.
 */
export async function mergeTicketAction(_prev: MergeState, formData: FormData): Promise<MergeState> {
  const reference = String(formData.get("reference") ?? "");
  const typed = String(formData.get("into") ?? "").trim();
  const picked = String(formData.get("pick") ?? "").trim();
  const into = typed || picked;
  if (!reference) return { error: "Missing ticket reference." };
  if (!into) return { fieldErrors: { into: ["Choose a ticket, or type its reference."] } };

  let target: string;
  try {
    target = (await mergeTicket(reference, into)).reference;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.message, fieldErrors: error.errors };
      if (error.status === 401) redirect("/admin/login");
      return { error: error.message };
    }
    return { error: "We could not merge the tickets. Try again shortly." };
  }

  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath(`/admin/tickets/${target}`);
  revalidatePath("/admin/tickets");
  revalidatePath("/admin");
  redirect(`/admin/tickets/${target}?done=ticket-merged`);
}
