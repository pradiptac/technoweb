import type { CartSummary } from "@/types/api";
import { formatPaise } from "@/lib/money";

/**
 * The delivery row's words as the website shows prices (0.178.0).
 *
 * `shipping_label` is the API's own sentence ("Free", "₹60", "Worked out
 * at checkout") and quotes delivery with GST. When the website shows
 * prices before GST the row has to as well, or the column stops adding up
 * to the total, so a charged delivery prints `shown_shipping_paise` there.
 */
export function shownDelivery(cart: CartSummary): string | null | undefined {
  return cart.gst_added_paise > 0 && cart.shown_shipping_paise
    ? formatPaise(cart.shown_shipping_paise)
    : cart.shipping_label;
}
