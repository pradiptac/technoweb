"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bulkTickets, updateTicket } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import type { TicketPriority, TicketStatus } from "@/types/api";

export async function updateTicketStatus(reference: string, status: TicketStatus) {
  await updateTicket(reference, { status });
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath("/admin");
}

export type BulkTicketState = { ok?: string; error?: string; refused?: { reference: string; message: string }[] };

/**
 * The selection bar's one action: `ids[]` plus whichever of status, assignee
 * and priority was not left at "Leave". `assigned_to` of `none` is a real
 * value — unassign — where blank means untouched.
 */
export async function bulkTicketsAction(_prev: BulkTicketState, formData: FormData): Promise<BulkTicketState> {
  const ids = formData.getAll("ids").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { error: "Nothing is selected." };

  const data: Parameters<typeof bulkTickets>[1] = {};
  const status = String(formData.get("status") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const assignee = String(formData.get("assigned_to") ?? "");
  if (status) data.status = status as TicketStatus;
  if (priority) data.priority = priority as TicketPriority;
  if (assignee === "none") data.assigned_to = null;
  else if (assignee) data.assigned_to = Number(assignee);
  if (Object.keys(data).length === 0) return { error: "Choose a status, an assignee or a priority to apply." };

  let result: Awaited<ReturnType<typeof bulkTickets>>;
  try {
    result = await bulkTickets(ids, data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    return { error: error instanceof ApiError ? error.message : "That update failed." };
  }

  revalidatePath("/admin/tickets");
  revalidatePath("/admin");
  for (const reference of result.updated) revalidatePath(`/admin/tickets/${reference}`);

  const n = result.updated.length;
  return {
    ok: n === 0 ? undefined : `Updated ${n} ticket${n === 1 ? "" : "s"}.`,
    error: n === 0 && result.refused.length ? "Nothing could be updated." : undefined,
    refused: result.refused,
  };
}

export async function updateTicketAssignee(reference: string, assignedTo: number | null) {
  await updateTicket(reference, { assigned_to: assignedTo });
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath("/admin");
}
