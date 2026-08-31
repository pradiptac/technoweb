"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { cartToken, clearCartToken } from "@/lib/cart";
import { placeOrder } from "@/lib/store";

export type CheckoutState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Place the order, then send the person to it.
 *
 * The basket is identified by the cookie, never by anything in the form: a
 * hidden field naming a cart is a hidden field somebody can change to
 * somebody else's cart.
 *
 * **The redirect is outside the try.** `redirect()` works by throwing, and a
 * `catch` that tries to recognise its error swallows it instead — this project
 * has already shipped that once, on the campaign editor, where the record was
 * created while the screen said it had not been.
 */
export async function placeOrderAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const token = await cartToken();

  if (!token) return { error: "Your basket has expired. Add what you want again." };

  const value = (key: string) => {
    const raw = formData.get(key);

    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : undefined;
  };

  let orderNumber: string;
  let accessToken: string;

  try {
    const { order, accessToken: access } = await placeOrder(token, {
      name: value("name") ?? "",
      email: value("email") ?? "",
      phone: value("phone") ?? "",
      address: {
        line1: value("line1"),
        line2: value("line2"),
        city: value("city"),
        state: value("state"),
        pin: value("pin"),
        country: value("country") ?? "India",
      },
      gst_required: formData.get("gst_required") === "1",
      gstin: value("gstin"),
      company_name: value("company_name"),
      // The honeypot. Sent as-is so the API refuses it rather than this
      // silently dropping it — one trap, checked in one place.
      website: value("website"),
    });

    orderNumber = order.order_number;
    accessToken = access;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 422) {
        return {
          error: "Check the highlighted fields.",
          fieldErrors: error.errors,
        };
      }

      if (error.status === 429) {
        return { error: "That was a lot of attempts. Wait a minute and try again." };
      }
    }

    return { error: "We could not place the order. Nothing has been charged — try again shortly." };
  }

  /*
    The basket cookie goes with the order.

    The API has already emptied the cart; dropping the cookie too means the next
    visit starts clean rather than holding a token to an empty basket. Doing it
    before the redirect, because the redirect never returns.
  */
  await clearCartToken();

  redirect(`/order/${orderNumber}?token=${encodeURIComponent(accessToken)}`);
}
