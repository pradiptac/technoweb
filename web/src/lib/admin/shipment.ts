import "server-only";
import { apiFetch } from "@/lib/api";
import { token } from "./_shared";
import type { ShiprocketStatus } from "@/types/courier";

/**
 * Booking a parcel with the courier platform (docs/store.md "Shiprocket").
 * The connection and its test are `role:admin`; booking, the courier, the
 * pickup, the label, the cancellation and "where is it now" are a store
 * manager's, on the order's own routes. Every order action answers the
 * order; a refusal is a 422 in Shiprocket's own words.
 */

export type ShipmentAction = "book" | "assign" | "pickup" | "label" | "cancel" | "track";

export async function getShiprocketStatus(): Promise<ShiprocketStatus> {
  const res = await apiFetch<{ data: ShiprocketStatus }>("/admin/settings/shiprocket", { token: await token() });

  return res.data;
}

/** Signs in afresh and lists the pickup locations. Reads only; books nothing. */
export async function testShiprocket(): Promise<{ message: string; pickup_location_found: boolean }> {
  const res = await apiFetch<{ data: { message: string; pickup_location_found: boolean } }>(
    "/admin/settings/shiprocket/test", { method: "POST", token: await token() },
  );

  return res.data;
}

export async function runShipmentAction(orderNumber: string, action: ShipmentAction, body: Record<string, unknown> = {}): Promise<void> {
  await apiFetch(`/admin/store/orders/${encodeURIComponent(orderNumber)}/shipment/${action}`, {
    method: "POST", body, token: await token(),
  });
}
