import "server-only";
import { apiFetch } from "@/lib/api";
import type { Order, PaymentSession, Single } from "@/types/api";

/**
 * Orders and payments, server-side only.
 *
 * `server-only`, the rule `lib/settings.ts` and `lib/admin.ts` follow: an
 * order's access token must never reach a client bundle, and the surest way to
 * guarantee that is a module a client component cannot import.
 *
 * Nothing here is cached. An order changes when money arrives, which is the one
 * moment a stale read would be read as a failed payment.
 */

/** Place the order. The basket is identified by its token, not by the payload. */
export async function placeOrder(
  cartToken: string,
  details: Record<string, unknown>,
): Promise<{ order: Order; accessToken: string }> {
  const res = await apiFetch<Single<Order> & { meta?: { access_token?: string } }>("/checkout", {
    method: "POST",
    body: details,
    headers: { "X-Cart-Token": cartToken },
    cache: "no-store",
  });

  return { order: res.data, accessToken: res.meta?.access_token ?? "" };
}

export async function getOrder(orderNumber: string, token: string): Promise<Order> {
  const res = await apiFetch<Single<Order>>(
    `/orders/${encodeURIComponent(orderNumber)}?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );

  return res.data;
}

/** Open a payment. Returns what the gateway's own script needs, and no secret. */
export async function createPaymentSession(orderNumber: string, token: string): Promise<PaymentSession> {
  const res = await apiFetch<Single<PaymentSession>>(
    `/orders/${encodeURIComponent(orderNumber)}/pay`,
    { method: "POST", body: { token }, cache: "no-store" },
  );

  return res.data;
}

/**
 * Report what the browser came back with.
 *
 * The API checks the signature; this is a courier. The order is settled by the
 * webhook whatever happens here, which is why a failure below is worded as
 * "we could not confirm it yet" rather than "you were not charged".
 */
export async function verifyPayment(
  orderNumber: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<Order> {
  const res = await apiFetch<Single<Order>>(
    `/orders/${encodeURIComponent(orderNumber)}/verify`,
    { method: "POST", body: { token, ...payload }, cache: "no-store" },
  );

  return res.data;
}
