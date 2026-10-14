import { getToken } from "@/lib/auth";
import { streamPrivateFile } from "@/lib/stream-attachment";
import { isOrderNumber } from "@/lib/order-access";

/**
 * A customer's own GST invoice (0.176.0, `docs/store.md` "The GST invoice").
 *
 * `streamPrivateFile`'s docblock is the contract: **the caller checks every
 * segment it puts in the path**, because nothing in there knows the shape.
 * An order number is `isOrderNumber`'s, which is the same check the order
 * page and its cookie use.
 *
 * The API scopes it by `customer_id` and answers 404 for another customer's
 * order and for an unpaid one; passing that through unchanged is what keeps
 * a 404 from being a 403 that confirms the order exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  if (!isOrderNumber(number)) {
    return new Response("Not found.", { status: 404 });
  }

  return streamPrivateFile(
    await getToken(),
    `my/orders/${encodeURIComponent(number)}/invoice`,
    `invoice-${number}.pdf`,
  );
}
