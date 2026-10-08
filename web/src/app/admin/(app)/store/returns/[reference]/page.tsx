import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RETURN_TONE } from "@/components/store/order-returns";
import { ApiError } from "@/lib/api";
import { getReturn } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { formatBytes } from "@/lib/format-bytes";
import { formatPaise } from "@/lib/money";
import { requireScreen } from "@/lib/admin-screen";
import type { AdminReturn } from "@/types/returns";
import { ClosePanel, DecisionPanel, ReceivePanel, RefundPanel, StaffNotePanel } from "./return-panels";

export const metadata = buildMetadata({ title: "Return", path: "/admin/store/returns", seo: noIndex });

const REFERENCE = /^[A-Za-z][A-Za-z0-9]{1,5}-\d{4}-\d{1,9}$/;

/** One return (docs/store.md "Returns"): what was asked, what has happened, and the move the desk may make now. */
export default async function AdminReturnPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireScreen();
  const { reference } = await params;
  if (!REFERENCE.test(reference)) notFound();

  let r: AdminReturn;
  try {
    r = await getReturn(reference);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const stamps: [string, string | null][] = [
    ["Asked for", r.requested_at],
    ["Approved", r.approved_at],
    ["Not accepted", r.rejected_at],
    ["Items received", r.received_at],
    ["Refunded", r.refunded_at],
    ["Closed", r.closed_at],
  ];

  return (
    <>
      <PageHeader back={{ href: "/admin/store/returns", label: "All returns" }} title={`Return ${r.reference}`}>
        <Badge tone={RETURN_TONE[r.status]}>{r.status_label}</Badge>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div className="grid min-w-0 gap-5">
          <Card as="section" interactive={false} padding="md">
            <h2 className="mb-3 text-15 font-semibold">What is coming back</h2>
            <ul className="grid gap-3">
              {(r.items ?? []).map((line) => (
                <li key={line.id} className="flex flex-wrap gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-14 font-medium [overflow-wrap:anywhere]">{line.name ?? "An item"}</p>
                    {line.variation_name && <p className="text-13 text-muted">{line.variation_name}</p>}
                    {line.sku && <p className="font-mono text-12 text-faint">{line.sku}</p>}
                    <p className="mt-1 text-12-5 text-muted">
                      {line.quantity} of {line.ordered_quantity} bought
                      {line.received_quantity !== null && ` · ${line.received_quantity} arrived`}
                      {line.restocked_quantity > 0 && ` · ${line.restocked_quantity} back in stock`}
                    </p>
                  </div>
                  <p className="tabular-nums text-muted">{formatPaise(line.unit_price_paise)} each</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" interactive={false} padding="md">
            <h2 className="mb-2 text-15 font-semibold">Why</h2>
            <p className="text-14 font-medium">{r.reason_label}</p>
            {r.details
              ? <p className="mt-2 whitespace-pre-line text-14 text-ink-2">{r.details}</p>
              : <p className="mt-2 text-13 text-muted">The customer wrote nothing more.</p>}

            {(r.photos ?? []).length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-13-5 font-semibold">Photographs</h3>
                <ul className="grid gap-2">
                  {(r.photos ?? []).map((photo) => (
                    <li key={photo.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line-strong px-3 py-2 text-13">
                      <span className="min-w-0 truncate font-medium">{photo.name}</span>
                      <span className="text-muted">{formatBytes(photo.size)}</span>
                      {/* A plain link: a `next/link` to a route handler is prefetched. */}
                      <a href={`/api/admin/store/returns/${r.reference}/photos/${photo.id}`} className="ml-auto inline-flex min-h-6 items-center font-semibold text-brand-ink underline">
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {r.decision_note && (
            <Card as="section" interactive={false} padding="md">
              <h2 className="mb-2 text-15 font-semibold">What the customer was told</h2>
              <p className="whitespace-pre-line text-14 text-ink-2">{r.decision_note}</p>
              {r.decided_by && <p className="mt-2 text-12-5 text-muted">By {r.decided_by}.</p>}
            </Card>
          )}

          <DecisionPanel r={r} />
          <ReceivePanel r={r} />
          <RefundPanel r={r} />
          <ClosePanel r={r} />
        </div>

        <div className="grid min-w-0 gap-5">
          <Card as="section" interactive={false} padding="md">
            <h2 className="mb-3 text-15 font-semibold">Customer and order</h2>
            <dl className="grid gap-2 text-14">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Customer</dt>
                <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{r.customer_name ?? "—"}</dd>
              </div>
              {r.customer_email && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Email</dt>
                  <dd className="min-w-0 text-right [overflow-wrap:anywhere]"><a className="text-brand-ink hover:underline" href={`mailto:${r.customer_email}`}>{r.customer_email}</a></dd>
                </div>
              )}
              {r.customer_phone && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Mobile</dt>
                  <dd className="font-mono text-13">{r.customer_phone}</dd>
                </div>
              )}
              {r.order && (
                <>
                  <div className="flex justify-between gap-4 border-t border-line pt-2">
                    <dt className="text-muted">Order</dt>
                    <dd>
                      <Link href={`/admin/store/orders/${r.order.order_number}`} className="font-mono font-semibold text-brand-ink hover:underline">
                        {r.order.order_number}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Order status</dt>
                    <dd>{r.order.status_label}{r.order_paid ? "" : " · not paid"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Order total</dt>
                    <dd className="tabular-nums">{formatPaise(r.order.total_paise)}</dd>
                  </div>
                </>
              )}
              {r.refund_paise !== null && (
                <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">
                    {formatPaise(r.refund_paise)}
                    {r.refund_reference && <span className="ml-2 font-mono text-12 font-normal text-muted">{r.refund_reference}</span>}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card as="section" interactive={false} padding="md">
            <h2 className="mb-3 text-15 font-semibold">What has happened</h2>
            <dl className="grid gap-2 text-14">
              {stamps.filter(([, at]) => at).map(([label, at]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd>{formatDate(at)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <StaffNotePanel r={r} />
        </div>
      </div>
    </>
  );
}
