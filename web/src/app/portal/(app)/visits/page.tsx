import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconWrench } from "@/components/icons";
import { VisitStatusBadge } from "@/components/visits/visit-summary";
import { getMyVisits } from "@/lib/portal";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import type { CustomerVisit, Paginated } from "@/types/api";

export const metadata = buildMetadata({ title: "Your visits", path: "/portal/visits", seo: noIndex });

/** The customer's own engineer visit requests (docs/visits.md), newest first. */
export default async function PortalVisitsPage() {
  let visits: Paginated<CustomerVisit>;

  try {
    visits = await getMyVisits();
  } catch {
    return (
      <ErrorState title="We could not load your visits">
        Try again shortly, or call us and we will look them up.
      </ErrorState>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 className="display-3 mb-1">Your visits</h2>
          <p className="measure text-14 text-muted">
            Engineer visits you have asked for while signed in. A request made without signing in is
            reachable from the link in its email.
          </p>
        </div>
        <Link href="/book-a-visit"
          className="ml-auto inline-flex items-center rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on shadow-2 hover:bg-brand-700">
          Request a visit
        </Link>
      </div>

      {visits.data.length === 0 ? (
        <EmptyState icon={<IconWrench />} title="No visits yet">
          <span className="block">
            Need an engineer on site? <Link className="underline" href="/book-a-visit">Request a visit</Link>.
          </span>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {visits.data.map((visit) => (
            <li key={visit.reference} className="rounded-lg border border-line-strong bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/portal/visits/${visit.reference}`} className="font-mono text-13-5 font-medium hover:underline">
                  {visit.reference}
                </Link>
                <VisitStatusBadge status={visit.status} label={visit.status_label} />
                <span className="min-w-0 text-14">{visit.topic}</span>
              </div>
              <p className="mt-1 text-12-5 text-muted">
                {visit.status === "confirmed" && visit.visit_date
                  ? `Booked for ${visit.visit_date}, ${visit.visit_time}`
                  : visit.status === "requested"
                    ? `Asked for ${visit.preferred.map((p) => p.label).join(" · ")}`
                    : `Requested ${formatDate(visit.created_at)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
