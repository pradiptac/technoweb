"use server";

import { revalidatePath } from "next/cache";
import { updateTicket } from "@/lib/admin";
import type { TicketStatus } from "@/types/api";

export async function updateTicketStatus(reference: string, status: TicketStatus) {
  await updateTicket(reference, { status });
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath("/admin");
}

export async function updateTicketAssignee(reference: string, assignedTo: number | null) {
  await updateTicket(reference, { assigned_to: assignedTo });
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${reference}`);
  revalidatePath("/admin");
}
