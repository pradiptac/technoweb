"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api";
import { createPaymentSession, verifyPayment } from "@/lib/store";
import type { PaymentSession } from "@/types/api";

/**
 * The two halves of paying.
 *
 * Both take the order's access token, and it is passed rather than hidden. An
 * earlier cut kept it in a cookie so it would not reach the browser, which
 * sounds better and buys nothing: the token is in the URL the customer was
 * emailed, so it is already in that browser's address bar, history and
 * `window.location`. Adding a cookie dance would have been ceremony around a
 * secret the page is *addressed by*.
 *
 * What matters is what the token can do, and the answer is: read this one
 * order, and pay it. The API checks it with `hash_equals` and answers 404 —
 * never 403 — for a wrong one, so it cannot be used to discover which order
 * numbers exist.
 */

export async function openPaymentAction(
  orderNumber: string,
  token: string,
): Promise<PaymentSession | { error: string }> {
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
  token: string,
  payload: Record<string, string>,
): Promise<{ error?: string }> {
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
