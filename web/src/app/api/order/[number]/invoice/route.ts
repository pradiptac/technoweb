import { NextRequest, NextResponse } from "next/server";
import { isOrderNumber, orderToken } from "@/lib/order-access";

export const dynamic = "force-dynamic";

/**
 * The guest's GST invoice (0.176.0, `docs/store.md` "The GST invoice").
 *
 * The browser never holds the order's token — it lives in an httpOnly
 * cookie scoped to `/order/{n}`, the rule the order page itself follows —
 * so this reads it here and forwards it to the API. The page links to this
 * address with a plain `<a download>` and not a `Link`: a `Link` prefetches,
 * and a prefetch here would fetch somebody's invoice on hover.
 *
 * Everything that decides whether the file is handed over is the API's: the
 * token is compared there with `hash_equals`, the order must be paid, and a
 * wrong token is the same 404 a wrong number is. This only carries bytes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;

  if (!isOrderNumber(number)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = await orderToken(number);

  if (!token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/orders/${encodeURIComponent(number)}/invoice?token=${encodeURIComponent(token)}`,
    { headers: { Accept: "application/pdf" }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition":
        upstream.headers.get("content-disposition") ?? `attachment; filename="invoice-${number}.pdf"`,
      // Somebody's invoice, with their name and address on it. Never a
      // shared or proxy cache.
      "Cache-Control": "private, no-store",
    },
  });
}
