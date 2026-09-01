import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Badge, orderStatusTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { getOrder } from "@/lib/store";
import { formatPaise } from "@/lib/money";
import { RevealCode } from "./reveal-code";
import { PaymentInstructionsPanel } from "./payment-instructions";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PayButton } from "./pay-button";
import type { Order } from "@/types/api";

/** One person's order, addressed by a secret. Nothing here may be cached. */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your order", path: "/order", seo: noIndex });


export default async function OrderPage({
  params, searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { number } = await params;
  const { token } = await searchParams;

  if (!token) notFound();

  let order: Order;

  try {
    order = await getOrder(number, token);
  } catch {
    // The API answers 404 for a wrong token as well as a wrong number, so this
    // page cannot tell an attacker which order numbers exist either.
    notFound();
  }

  const unpaid = order.status === "pending_payment";

  return (
    <>
      <PageHero
        kicker="Store"
        title={`Order ${order.order_number}`}
        crumbs={[{ name: "Store", path: "/store" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div className="min-w-0">
              {unpaid ? (
                <Alert tone="warn" title="This order is not paid yet" dismissible={false}>
                  Nothing has been charged. Pay below to confirm it — the items are held for you
                  until then, but not reserved indefinitely.
                </Alert>
              ) : (
                <Alert tone="ok" title="Payment received" dismissible={false}>
                  Thank you. A confirmation is on its way to {order.customer_email}.
                </Alert>
              )}

              <div className="mt-4 rounded-lg border border-line-strong bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="text-[15px] font-semibold">What you ordered</h2>
                  <Badge tone={orderStatusTone[order.status]}>{order.status_label}</Badge>
                </div>

                <ul className="grid gap-3">
                  {order.items?.map((line) => (
                    <li key={line.id} className="flex flex-wrap gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium">{line.name}</p>
                        {line.variation_name && (
                          <p className="text-[13px] text-muted">{line.variation_name}</p>
                        )}
                        {line.sku && <p className="font-mono text-[12px] text-faint">{line.sku}</p>}
                        <p className="text-[12.5px] text-faint">× {line.quantity}</p>
                        {!line.returnable && (
                          <p className="text-[12px] font-medium text-warn">Non-returnable</p>
                        )}

                        {/*
                          The reveal, which had no control behind it at all: the
                          endpoint shipped, the receipt told people to "open your
                          order to reveal it", and there was nothing on this page
                          to press. Same shape as the newsletter's Groups screen
                          being reachable from nowhere.

                          Offered only once the order is paid *and* a code
                          exists — `has_codes` is the resource's own answer, so a
                          line still waiting on the shop shows nothing rather
                          than a button that explains itself only after being
                          pressed.
                        */}
                        {line.has_codes && (
                          <RevealCode
                            orderNumber={order.order_number}
                            token={token}
                            itemId={line.id}
                          />
                        )}
                      </div>
                      <p className="tabular-nums">{formatPaise(line.line_total_paise)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {order.payment_instructions && (
                <PaymentInstructionsPanel
                  instructions={order.payment_instructions}
                  orderNumber={order.order_number}
                  totalPaise={order.total_paise}
                />
              )}

              {/*
                Dispatch, entered by hand by whoever packs it. Absent until it
                has been — an empty "Tracking" heading with nothing under it
                reads as a system that has lost the parcel.
              */}
              {order.tracking_number && (
                <div className="mt-4 rounded-lg border border-line-strong bg-card p-5">
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
                </div>
              )}

              {order.shipping_address && (
                <div className="mt-4 rounded-lg border border-line-strong bg-card p-5">
                  <h2 className="mb-2 text-[15px] font-semibold">Delivering to</h2>
                  <address className="text-[14px] not-italic text-muted">
                    {order.customer_name}<br />
                    {order.shipping_address.line1}<br />
                    {order.shipping_address.line2 && <>{order.shipping_address.line2}<br /></>}
                    {order.shipping_address.city}, {order.shipping_address.state}{" "}
                    {order.shipping_address.pin}
                  </address>
                </div>
              )}
            </div>

            <aside className="rounded-lg border border-line-strong bg-card p-5 lg:sticky lg:top-24">
              <h2 className="mb-4 text-[15px] font-semibold">Summary</h2>

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

                <div className="flex justify-between gap-4 border-t border-line pt-2 text-[17px] font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatPaise(order.total_paise)}</dd>
                </div>

                <div className="flex justify-between gap-4 text-[12.5px] text-muted">
                  <dt>Includes GST</dt>
                  <dd className="tabular-nums">{formatPaise(order.gst_paise)}</dd>
                </div>
              </dl>

              {/*
                The gateway button, and only for a gateway order.

                It opened a payment session for whatever the order was — so an
                order somebody chose to pay by bank transfer showed both the
                account details *and* a "Pay ₹11,800" button, which is two
                different ways to pay the same invoice and an invitation to do
                both. `payment_instructions` is non-null exactly when the method
                is an offline one that is still owed, so its absence is the
                condition rather than a second flag to keep in step.
              */}
              {unpaid && !order.payment_instructions && (
                <div className="mt-5">
                  <PayButton orderNumber={order.order_number} token={token} totalPaise={order.total_paise} />
                </div>
              )}

              {order.gst_required && (
                <p className="measure mt-4 text-[12.5px] text-muted">
                  The GST invoice for {order.company_name} ({order.gstin}) is prepared by hand and
                  emailed to you — it is not generated automatically.
                </p>
              )}

              <p className="measure mt-4 text-[12.5px] text-muted">
                Keep this page&rsquo;s link. It is how you come back to this order, and it is in your
                confirmation email. <Link className="underline" href="/support">Something wrong?</Link>
              </p>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
