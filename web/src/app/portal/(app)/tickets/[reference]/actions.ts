"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { closeTicket, rateReply, reopenTicket, replyToTicket, reportReply } from "@/lib/portal";

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
      if (error.status === 401) redirect("/portal/login");
    }
    return { error: "We could not post your reply. Try again shortly." };
  }

  revalidatePath(`/portal/tickets/${reference}`);
  return { ok: true };
}

export type VerdictState = { error?: string; ok?: boolean };

/**
 * Stars on a staff reply. Called from the thread, so it revalidates the
 * ticket page and returns into the component rather than redirecting —
 * the stars stay where the pointer is.
 */
export async function rateReplyAction(reference: string, messageId: number, rating: number): Promise<VerdictState> {
  try {
    await rateReply(reference, messageId, rating);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/portal/login");
    return { error: "We could not save your rating. Try again shortly." };
  }
  revalidatePath(`/portal/tickets/${reference}`);
  return { ok: true };
}

export async function reportReplyAction(_prev: VerdictState, formData: FormData): Promise<VerdictState> {
  const reference = String(formData.get("reference") ?? "");
  const messageId = Number(formData.get("message_id"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reference || !messageId) return { error: "Missing ticket reference." };
  if (reason.length < 5) return { error: "Say what was wrong with the reply — a few words is enough." };

  try {
    await reportReply(reference, messageId, reason);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: error.errors?.reason?.[0] ?? error.message };
      if (error.status === 401) redirect("/portal/login");
    }
    return { error: "We could not send your report. Try again shortly." };
  }
  revalidatePath(`/portal/tickets/${reference}`);
  return { ok: true };
}

export async function closeAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "");
  await closeTicket(reference).catch(() => null);
  revalidatePath(`/portal/tickets/${reference}`);
  revalidatePath("/portal");
}

export async function reopenAction(formData: FormData) {
  const reference = String(formData.get("reference") ?? "");
  await reopenTicket(reference).catch(() => null);
  revalidatePath(`/portal/tickets/${reference}`);
  revalidatePath("/portal");
}
