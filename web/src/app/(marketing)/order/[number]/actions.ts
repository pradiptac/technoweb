"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { createPaymentSession, requestReturn, verifyPayment } from "@/lib/store";
import { orderToken } from "@/lib/order-access";
import { returnPayload } from "@/lib/return-payload";
import type { ReturnFormState } from "@/components/store/return-form";
import type { PaymentSession } from "@/types/api";

/**
 * The two halves of paying.
 *
 * Neither takes the order's access token: each reads it from the httpOnly
 * cookie `/order/{n}/open` set (`lib/order-access.ts`). This comment used to
 * argue the opposite — that the token was already in the page's URL, so
 * handing it to the browser cost nothing. The URL was the problem: it was
 * `location.href` on a page that loads Google Analytics and the Meta Pixel, so
 * every order's key went to both. With the URL clean, the token stays on the
 * server; the actions post to the page's own path, so the cookie arrives.
 *
 * What the token can do is read this one order, and pay it. The API checks it
 * with `hash_equals` and answers 404 — never 403 — for a wrong one, so it
 * cannot be used to discover which order numbers exist.
 */

const NO_ACCESS = "This order is no longer open in this browser. Use the link in your order email.";

export async function openPaymentAction(
  orderNumber: string,
): Promise<PaymentSession | { error: string }> {
  const token = await orderToken(orderNumber);
  if (!token) return { error: NO_ACCESS };

  try {
    return await createPaymentSession(orderNumber, token);
  } catch (error) {
    if (error instanceof ApiError) {
      // The API's own sentence, which distinguishes "not set up" from "already
      // paid" from the gateway's own refusal. Replacing all three with
      // "payment failed" would tell an operator nothing about which is which.
      return { error: error.message || "We could not open a payment." };
    }

    return { error: "We could not open a payment. Try again shortly." };
  }
}

export async function confirmPaymentAction(
  orderNumber: string,
  payload: Record<string, string>,
): Promise<{ error?: string }> {
  const token = await orderToken(orderNumber);
  if (!token) return { error: NO_ACCESS };

  try {
    await verifyPayment(orderNumber, token, payload);
  } catch (error) {
    /*
     * Never "you were not charged".
     *
     * A signature this application will not act on is not the same as a payment
     * that did not happen — the money may well have left, and the webhook
     * settles the order either way. Telling somebody they were not charged
     * sends them to their bank over nothing.
     */
    if (error instanceof ApiError) {
      return { error: error.message || "We could not confirm that payment yet." };
    }

    return {
      error: "We could not confirm that payment yet. If money has left your account, this page will update shortly.",
    };
  }

  revalidatePath(`/order/${orderNumber}`);

  return {};
}

/**
 * Revealing an activation code.
 *
 * A Server Action for the same reason the two above are: the API base URL is an
 * internal address the browser cannot reach. The order's token comes from the
 * path-scoped cookie, like the two above — most people who buy here never sign
 * in, so the link's token is the only key there is.
 *
 * The activation procedure comes back with the code. Both are the same stored
 * text the email is built from, so the screen and the message cannot say
 * different things about how to use one licence.
 */
export async function revealCodeAction(
  orderNumber: string,
  itemId: number,
): Promise<
  | { ok: true; codes: { id: number; code: string }[]; procedure: { html: string | null; pdf_url: string | null; pdf_name: string | null } }
  | { ok: false; message: string }
> {
  const token = await orderToken(orderNumber);
  if (!token) return { ok: false, message: NO_ACCESS };

  try {
    const res = await apiFetch<{
      data: { id: number; code: string }[];
      procedure: { html: string | null; pdf_url: string | null; pdf_name: string | null };
    }>(
      `/orders/${encodeURIComponent(orderNumber)}/items/${itemId}/reveal?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );

    return { ok: true, codes: res.data, procedure: res.procedure };
  } catch (error) {
    /*
     * A 202 means paid, digital and nothing to hand over yet — the inventory
     * ran out, or the shop fulfils by hand. That is not an error the customer
     * caused, and the API already says it in words worth repeating. Anything
     * else gets one sentence of our own.
     */
    if (error instanceof ApiError && error.message) {
      return { ok: false, message: error.message };
    }

    return { ok: false, message: "We could not reveal that code just now. Please try again shortly." };
  }
}

/**
 * A return, asked for from the order's own page (docs/store.md "Returns").
 *
 * The path the form takes when no photograph is attached; with one, the
 * browser posts the multipart body to `/order/{n}/returns`, which lives
 * under the order's own path because that is where the token's cookie is
 * sent. Either way the token is read from that cookie here on the server
 * and never from the form.
 */
export async function requestReturnAction(
  orderNumber: string,
  _prev: ReturnFormState,
  formData: FormData,
): Promise<ReturnFormState> {
  const token = await orderToken(orderNumber);
  if (!token) return { error: NO_ACCESS };

  try {
    const { message } = await requestReturn(orderNumber, token, returnPayload(formData));
    revalidatePath(`/order/${orderNumber}`);

    return { ok: message };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) return { error: "Check the highlighted fields.", fieldErrors: error.errors };
      if (error.status === 429) return { error: "That is a lot of requests in a short time. Wait a minute and try again." };
      if (error.status === 404) return { error: NO_ACCESS };
    }

    return { error: "We could not send that. Try again shortly, or contact us." };
  }
}
