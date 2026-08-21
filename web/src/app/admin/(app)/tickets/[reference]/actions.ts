"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { replyToTicket } from "@/lib/admin";

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
