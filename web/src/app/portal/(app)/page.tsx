import Link from "next/link";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconArrowRight, IconTicket } from "@/components/icons";
import { getTicketSummary, getTickets } from "@/lib/portal";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { NewTicketButton } from "./portal-nav";
import type { Ticket, TicketSummary } from "@/types/api";

export const metadata = buildMetadata({
  title: "Dashboard",
  path: "/portal",
  seo: noIndex,
});

const cards: { key: keyof TicketSummary; label: string; href: string }[] = [
  { key: "open", label: "Open", href: "/portal/tickets?status=open" },
  { key: "in_progress", label: "In progress", href: "/portal/tickets?status=in_progress" },
  { key: "pending", label: "Awaiting your reply", href: "/portal/tickets?status=pending_customer" },
  { key: "resolved", label: "Resolved", href: "/portal/tickets?status=resolved" },
];

export default async function PortalDashboard() {
  let summary: TicketSummary | null = null;
  let recent: Ticket[] = [];
  let failed = false;

  try {
    const [s, list] = await Promise.all([getTicketSummary(), getTickets()]);
    summary = s;
    recent = list.data.slice(0, 5);
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

      <dl className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const value = summary?.[c.key] ?? 0;
          return (
            <Link
              key={c.key}
              href={c.href}
              className="rounded-lg border border-line-strong bg-white p-4.5 transition-all duration-200 hover:border-brand-300 hover:shadow-1"
            >
              <dd className="font-display text-[28px] font-bold leading-none tracking-[-.03em]">
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
          <Link href="/portal/tickets" className="ml-auto inline-flex items-center gap-1.5 py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
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
                className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-line-strong bg-white px-4.5 py-4 transition-colors duration-200 hover:border-brand-300 hover:bg-brand-50"
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
