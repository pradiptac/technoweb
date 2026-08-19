"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createTicket } from "@/lib/portal";

export type TicketFormState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createTicketAction(
  _prev: TicketFormState,
  formData: FormData,
): Promise<TicketFormState> {
  let reference: string;

  try {
    // Drop empty file inputs — an untouched <input type="file"> still submits
    // a zero-byte entry, which Laravel would reject as an invalid upload.
    const files = formData.getAll("attachments").filter(
      (f): f is File => f instanceof File && f.size > 0,
    );
    formData.delete("attachments");
    files.forEach((f) => formData.append("attachments[]", f));

    const ticket = await createTicket(formData);
    reference = ticket.reference;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) {
        return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      }
      if (error.status === 401) redirect("/portal/login");
      if (error.status === 429) {
        return { error: "You have raised several tickets in quick succession. Wait a minute and try again." };
      }
    }
    return { error: "We could not submit the ticket. Try again, or call the support line." };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/tickets");
  redirect(`/portal/tickets/${reference}?created=1`);
}
