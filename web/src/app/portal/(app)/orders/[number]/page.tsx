import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getMyOrder } from "@/lib/portal";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Order } from "@/types/api";

const TONE: Record<string, "resolved" | "open" | "progress" | "closed" | "urgent"> = {
  pending_payment: "open",
  paid: "resolved",
  processing: "progress",
  ready_for_dispatch: "progress",
  dispatched: "progress",
  completed: "resolved",
  cancelled: "closed",
  refund_requested: "urgent",
  refunded: "closed",
};

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  return buildMetadata({ title: `Order ${number}`, path: `/portal/orders/${number}`, seo: noIndex });
}

export default async function PortalOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  let order: Order;

  try {
    order = await getMyOrder(number);
  } catch (error) {
    // An order belonging to somebody else is a 404 from the API, so this page
    // cannot be used to discover which order numbers exist either.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <p className="mb-2 text-[13px]">
        <Link href="/portal/orders" className="text-muted hover:underline">← Your orders</Link>
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="display-3">{order.order_number}</h1>
        <Badge tone={TONE[order.status] ?? "closed"}>{order.status_label}</Badge>
      </div>

      {order.status === "pending_payment" && (
        <Alert tone="warn" title="This order has not been paid" dismissible={false}>
          Nothing has been charged. The payment link is in your confirmation email — open it there
          to finish the order.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <section className="rounded-lg border border-line-strong bg-card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">What you ordered</h2>

          <ul className="grid gap-3">
            {order.items?.map((line) => (
              <li key={line.id} className="flex flex-wrap gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{line.name}</p>
                  {line.variation_name && <p className="text-[13px] text-muted">{line.variation_name}</p>}
                  {line.sku && <p className="font-mono text-[12px] text-faint">{line.sku}</p>}
                  <p className="text-[12.5px] text-faint">× {line.quantity}</p>
                  {!line.returnable && (
                    <p className="mt-1 text-[12px] font-medium text-warn">Non-returnable</p>
                  )}
                </div>
                <p className="tabular-nums">{formatPaise(line.line_total_paise)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-5">
          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Summary</h2>

            <dl className="grid gap-2 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatPaise(order.subtotal_paise)}</dd>
              </div>

              {order.discount_paise > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Discount</dt>
                  <dd className="tabular-nums text-ok">−{formatPaise(order.discount_paise)}</dd>
                </div>
              )}

              <div className="flex justify-between gap-4 border-t border-line pt-2 text-[16px] font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPaise(order.total_paise)}</dd>
              </div>

              <div className="flex justify-between gap-4 text-[12.5px] text-muted">
                <dt>Includes GST</dt>
                <dd className="tabular-nums">{formatPaise(order.gst_paise)}</dd>
              </div>
            </dl>
          </section>

          {order.tracking_number && (
            <section className="rounded-lg border border-line-strong bg-card p-5">
              <h2 className="mb-2 text-[15px] font-semibold">Delivery</h2>
              <p className="text-[14px]">
                {order.courier && <span className="font-medium">{order.courier}</span>}{" "}
                <span className="font-mono text-[13px]">{order.tracking_number}</span>
              </p>
              {order.tracking_url && (
                <ButtonLink href={order.tracking_url} variant="secondary" size="sm" className="mt-3">
                  Track this shipment
                </ButtonLink>
              )}
            </section>
          )}

          {/*
            The support route the brief asks for: a ticket about this order,
            with the reference already in the subject so nobody has to be asked
            for it. Reuses the ticket module rather than inventing a second
            conversation for orders.
          */}
          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-2 text-[15px] font-semibold">Something wrong?</h2>
            <p className="measure mb-3 text-[13px] text-muted">
              Raise a ticket about this order and it goes to the same desk as everything else.
            </p>
            <ButtonLink
              href={`/portal/tickets/new?subject=${encodeURIComponent(`Order ${order.order_number}`)}`}
              variant="secondary"
              size="sm"
            >
              Raise a ticket
            </ButtonLink>
          </section>
        </div>
      </div>
    </>
  );
}
