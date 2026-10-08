import "server-only";
import { apiFetch } from "@/lib/api";
import { query, token } from "./_shared";
import type { Paginated } from "@/types/api";
import type { AdminReturn, AdminReturnListMeta } from "@/types/returns";

/*
 * The returns desk (docs/store.md "Returns"). There is no create and no
 * delete: a return exists because a customer asked for one, and one that
 * should not have been is rejected or closed. Each move is its own call,
 * because each does something besides change the status.
 */

type ListParams = {
  q?: string; status?: string; reason?: string; open?: string;
  sort?: string; dir?: string; page?: number; per_page?: number;
};

export async function getReturnList(params: ListParams = {}) {
  return apiFetch<Paginated<AdminReturn> & { meta: Paginated<AdminReturn>["meta"] & AdminReturnListMeta }>(
    `/admin/store/returns${query(params)}`, { token: await token() },
  );
}

export async function getReturn(reference: string): Promise<AdminReturn> {
  const res = await apiFetch<{ data: AdminReturn }>(`/admin/store/returns/${encodeURIComponent(reference)}`, { token: await token() });
  return res.data;
}

async function move(reference: string, verb: string, body: Record<string, unknown> = {}): Promise<AdminReturn> {
  const res = await apiFetch<{ data: AdminReturn }>(
    `/admin/store/returns/${encodeURIComponent(reference)}/${verb}`,
    { method: "POST", body, token: await token() },
  );
  return res.data;
}

export const approveReturn = (reference: string, note: string | null) => move(reference, "approve", { note });
export const rejectReturn = (reference: string, note: string) => move(reference, "reject", { note });
export const receiveReturn = (
  reference: string,
  items: { id: number; received_quantity: number | null; restock: boolean }[],
) => move(reference, "receive", { items });
export const refundReturn = (
  reference: string,
  details: { amount_paise: number; reference: string; note: string | null },
) => move(reference, "refund", details);
export const closeReturn = (reference: string, note: string | null) => move(reference, "close", { note });

export async function saveReturnNote(reference: string, staffNote: string | null): Promise<AdminReturn> {
  const res = await apiFetch<{ data: AdminReturn }>(
    `/admin/store/returns/${encodeURIComponent(reference)}`,
    { method: "PATCH", body: { staff_note: staffNote }, token: await token() },
  );
  return res.data;
}
