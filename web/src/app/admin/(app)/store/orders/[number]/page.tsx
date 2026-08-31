import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getStoreOrder } from "@/lib/admin";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FulfilPanel, InvoicePanel, NotePanel, ShippingPanel, StatusPanel } from "./order-panels";
import type { AdminOrder } from "@/types/api";

/*
  One map from status to colour, shared with the list — the argument `TONE_BAR`
  makes for the ticket charts. Two maps drift the first time somebody restyles
  one, and then "Dispatched" is a different colour on two screens one click
  apart.
*/
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

  return buildMetadata({ title: `Order ${number}`, path: `/admin/store/orders/${number}`, seo: noIndex });
}

export default async function AdminOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  let order: AdminOrder;

  try {
    order = await getStoreOrder(number);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const address = order.shipping_address ?? order.billing_address;

  return (
    <>
      <PageHeader back={{ href: "/admin/store/orders", label: "Orders" }} title={order.order_number}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {order.awaiting_codes && <Badge tone="urgent">Code needed</Badge>}
          <Badge tone={TONE[order.status] ?? "closed"}>{order.status_label}</Badge>
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="grid gap-5">
          {order.awaiting_codes && <FulfilPanel order={order} />}

          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">What was ordered</h2>

            <ul className="grid gap-3">
              {order.items?.map((line) => (
                <li key={line.id} className="flex flex-wrap gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{line.name}</p>
                    {line.variation_name && <p className="text-[13px] text-muted">{line.variation_name}</p>}
                    {line.sku && <p className="font-mono text-[12px] text-faint">{line.sku}</p>}
                    <p className="text-[12.5px] text-faint">× {line.quantity}</p>

                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {!line.returnable && <Badge tone="urgent">Non-returnable</Badge>}

                      {line.needs_codes && (line.codes_outstanding > 0
                        ? <Badge tone="urgent">{line.codes_outstanding} outstanding</Badge>
                        : <Badge tone="resolved">{line.codes_issued} issued</Badge>)}

                      {line.needs_codes && line.store_product_id ? (
                        <Link
                          href={`/admin/store/products/${line.store_product_id}/codes`}
                          className="text-[12.5px] font-semibold text-brand-ink underline"
                        >
                          Inventory
                        </Link>
                      ) : null}
                    </span>
                  </div>

                  <p className="tabular-nums">{formatPaise(line.line_total_paise)}</p>
                </li>
              ))}
            </ul>
          </section>

          <StatusPanel order={order} />

          {/*
            Only for an order with something to send. A courier form on a
            licence order asks a question that has no answer.
          */}
          {order.needs_shipping ? <ShippingPanel order={order} /> : null}

          <InvoicePanel order={order} />
          <NotePanel order={order} />
        </div>

        <div className="grid gap-5">
          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Summary</h2>

            <dl className="grid gap-2 text-[13.5px]">
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

              <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPaise(order.total_paise)}</dd>
              </div>

              <div className="flex justify-between gap-4 text-[12.5px] text-muted">
                <dt>Of which GST</dt>
                <dd className="tabular-nums">{formatPaise(order.gst_paise)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Customer</h2>

            <p className="text-[14px]">{order.customer_name}</p>
            <p className="text-[13px] text-muted">{order.customer_email}</p>
            {order.customer_phone && <p className="text-[13px] text-muted">{order.customer_phone}</p>}

            {address && (
              <address className="mt-3 text-[13px] not-italic text-muted">
                {address.line1}<br />
                {address.line2 && <>{address.line2}<br /></>}
                {address.city}, {address.state} {address.pin}
              </address>
            )}

            {order.has_invoice && (
              <ButtonLink
                href={`/api/admin/store/orders/${order.order_number}/invoice`}
                variant="secondary"
                size="sm"
                className="mt-3"
              >
                Download the invoice
              </ButtonLink>
            )}
          </section>

          {(order.payments?.length ?? 0) > 0 && (
            <section className="rounded-lg border border-line-strong bg-card p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Payments</h2>

              <ul className="grid gap-2 text-[13px]">
                {order.payments?.map((p) => (
                  <li key={p.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.status === "paid" ? "resolved" : p.status === "failed" ? "urgent" : "open"}>
                        {p.status_label}
                      </Badge>
                      <span className="tabular-nums">{formatPaise(p.amount_paise)}</span>
                      {p.method && <span className="text-muted">{p.method}</span>}
                    </span>

                    {/*
                      The gateway's own identifier, so a figure here can be
                      reconciled against their dashboard. That is the whole
                      reason staff see it and the buyer does not.
                    */}
                    {p.gateway_payment_id && (
                      <p className="mt-1 font-mono text-[11.5px] text-faint">{p.gateway_payment_id}</p>
                    )}

                    {p.failure_reason && <p className="mt-1 text-[12px] text-err">{p.failure_reason}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-line-strong bg-card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">History</h2>

            <ol className="grid gap-2 text-[13px]">
              {order.history?.map((event, index) => (
                <li key={index} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <p>
                    {event.from_status ? `${event.from_status} → ` : ""}
                    <strong>{event.to_status}</strong>
                  </p>
                  {event.note && <p className="text-muted">{event.note}</p>}
                  <p className="text-[12px] text-faint">
                    {event.actor_name ?? "System"}
                    {event.at && ` · ${new Date(event.at).toLocaleString()}`}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
