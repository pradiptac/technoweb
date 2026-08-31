import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconBox } from "@/components/icons";
import { getMyOrders } from "@/lib/portal";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Order, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Your orders", path: "/portal/orders", seo: noIndex });

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

export default async function PortalOrdersPage() {
  let orders: Paginated<Order>;

  try {
    orders = await getMyOrders();
  } catch {
    return (
      <ErrorState title="We could not load your orders">
        Try again shortly, or call us and we will look them up.
      </ErrorState>
    );
  }

  return (
    <>
      <h1 className="display-3 mb-1">Your orders</h1>
      <p className="measure mb-6 text-[14px] text-muted">
        Everything bought through the shop with this address. An order placed before you had an
        account is still reachable by the link in its confirmation email.
      </p>

      {orders.data.length === 0 ? (
        <EmptyState icon={<IconBox />} title="No orders yet">
          <span className="block">
            Nothing here. <Link className="underline" href="/store">Have a look at the store</Link>.
          </span>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {orders.data.map((order) => (
            <li key={order.order_number} className="rounded-lg border border-line-strong bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/portal/orders/${order.order_number}`}
                  className="font-mono text-[13.5px] font-medium hover:underline"
                >
                  {order.order_number}
                </Link>

                <Badge tone={TONE[order.status] ?? "closed"}>{order.status_label}</Badge>

                <span className="ml-auto tabular-nums">{formatPaise(order.total_paise)}</span>
              </div>

              <p className="mt-1 text-[12.5px] text-faint">
                {order.placed_at && new Date(order.placed_at).toLocaleDateString()}
                {order.items && ` · ${order.items.length} item${order.items.length === 1 ? "" : "s"}`}
              </p>

              {/*
                The tracking number on the row, not only inside the order.
                "Where is it" is the question this page is opened with, and
                making somebody click through to read a number they are about
                to type into a courier's site is a click for nothing.
              */}
              {order.tracking_number && (
                <p className="mt-1 text-[12.5px] text-muted">
                  {order.courier} <span className="font-mono">{order.tracking_number}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
