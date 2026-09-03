import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import {
  IconArrowRight, IconBox, IconCheck, IconClock, IconHeadset, IconTicket,
} from "@/components/icons";
import { getMyOrders, getTicketSummary, getTickets } from "@/lib/portal";
import { cn } from "@/lib/utils";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { NewTicketButton } from "./portal-nav";
import type { Ticket, TicketSummary } from "@/types/api";

export const metadata = buildMetadata({
  title: "Dashboard",
  path: "/portal",
  seo: noIndex,
});

/**
 * The five figures, each with its own tone.
 *
 * Tones are the status tokens the badges already use, so "open" is the same
 * blue on this card as it is on the badge next to a ticket in the list below
 * — one vocabulary, not two. Orders takes the brand rather than a status
 * colour, because it is not a state: it is a different kind of thing being
 * counted, which is exactly what its own colour should say.
 *
 * `from-*-soft` gradients rather than flat fills: soft tokens invert with the
 * scheme, so this reads in dark without a second palette. Nothing here is a
 * literal hex — the rule the whole design system is built on.
 */
const cards: {
  key: keyof TicketSummary | "orders";
  label: string;
  href: string;
  icon: typeof IconTicket;
  skin: string;
  ink: string;
}[] = [
  {
    key: "open", label: "Open", href: "/portal/tickets?status=open",
    icon: IconTicket, skin: "from-info-soft border-info/25", ink: "text-info",
  },
  {
    key: "in_progress", label: "In progress", href: "/portal/tickets?status=in_progress",
    icon: IconClock, skin: "from-warn-soft border-warn/25", ink: "text-warn",
  },
  {
    key: "pending", label: "Awaiting your reply", href: "/portal/tickets?status=pending_customer",
    icon: IconHeadset, skin: "from-err-soft border-err/25", ink: "text-err",
  },
  {
    key: "resolved", label: "Resolved", href: "/portal/tickets?status=resolved",
    icon: IconCheck, skin: "from-ok-soft border-ok/25", ink: "text-ok",
  },
  {
    key: "orders", label: "Orders", href: "/portal/orders",
    icon: IconBox, skin: "from-brand-50 border-brand-200", ink: "text-brand-ink",
  },
];

export default async function PortalDashboard() {
  let summary: TicketSummary | null = null;
  let recent: Ticket[] = [];
  let orderCount = 0;
  let failed = false;

  /*
    All three at once, and the orders call allowed to fail on its own.

    Its `.catch()` is inside the `Promise.all`, not after it: awaited
    separately the shop call would run only once the ticket calls had
    finished, which is a second round trip's latency on the first screen
    behind the login for a figure that has nothing to do with them. Failing
    on its own matters too — an order count is not worth taking the ticket
    dashboard down for, and the support half is what somebody in trouble came
    here for.

    `meta.total` rather than `data.length`: the endpoint paginates, so the
    length of page one is a count of at most one page.
  */
  try {
    const [s, list, orders] = await Promise.all([
      getTicketSummary(),
      getTickets(),
      getMyOrders().then((r) => r.meta.total).catch(() => 0),
    ]);

    summary = s;
    recent = list.data.slice(0, 5);
    orderCount = orders;
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <ErrorState title="We could not load your tickets">
        The support system is not responding right now. Try again in a few minutes — if it
        persists, call the support line and we will raise the ticket for you.
      </ErrorState>
    );
  }

  const totalOpen = (summary?.open ?? 0) + (summary?.in_progress ?? 0) + (summary?.pending ?? 0);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="display-3">
            {totalOpen === 0 ? "Nothing outstanding" : `${totalOpen} ticket${totalOpen === 1 ? "" : "s"} in progress`}
          </h2>
          <p className="mt-1 text-[14.5px] text-muted">
            {totalOpen === 0
              ? "Everything raised so far has been dealt with."
              : "Here is where each one stands."}
          </p>
        </div>
        <div className="ml-auto"><NewTicketButton /></div>
      </div>

      <dl className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => {
          const value = c.key === "orders" ? orderCount : (summary?.[c.key] ?? 0);

          return (
            <Link
              key={c.key}
              href={c.href}
              className={cn(
                // The gradient runs from the tone's own soft wash to the card
                // colour, so the tint sits at the top where the icon is and
                // fades out under the figure rather than washing the number.
                "group rounded-xl border bg-linear-to-b to-card p-4.5 transition-all duration-200",
                "hover:-translate-y-px hover:shadow-2 motion-reduce:hover:translate-y-0",
                c.skin,
              )}
            >
              <span
                className={cn(
                  "mb-3 grid size-11 place-items-center rounded-lg bg-card/70 transition-transform",
                  "group-hover:scale-105 motion-reduce:group-hover:scale-100",
                  c.ink,
                )}
              >
                <c.icon className="size-6" />
              </span>
              <dd className="font-display text-[30px] font-bold leading-none tracking-[-.03em]">
                {value}
              </dd>
              <dt className="mt-1.5 text-[13px] text-muted">{c.label}</dt>
            </Link>
          );
        })}
      </dl>

      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-[17px]">Recent tickets</h3>
        {recent.length > 0 && (
          <Link href="/portal/tickets" className="ml-auto inline-flex items-center gap-1.5 py-1 text-[13.5px] font-semibold text-brand-ink hover:underline">
            View all <IconArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <EmptyState
          icon={<IconTicket />}
          title="No tickets yet"
          action={<NewTicketButton />}
        >
          When something breaks — or you need a change made — raise it here and it lands
          straight on the support desk with an SLA clock attached.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5">
          {recent.map((t) => (
            <li key={t.id} className="min-w-0">
              <Link
                href={`/portal/tickets/${t.reference}`}
                className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-line-strong bg-card px-4.5 py-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="shrink-0 font-mono text-xs text-muted">{t.reference}</span>
                {t.is_overdue && <Badge tone="urgent">Overdue</Badge>}
                <span className="shrink-0 sm:ml-auto"><StatusBadge status={t.status} /></span>
                {/* Subject drops to its own line on narrow screens rather than
                    forcing the row wider than the viewport. */}
                <span className="w-full min-w-0 truncate text-[14.5px] font-medium sm:order-first sm:w-auto sm:flex-1">
                  {t.subject}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
