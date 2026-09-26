import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { Card } from "@/components/ui/card";
import { VisitStatusBadge, visitAddressLine } from "@/components/visits/visit-summary";
import { getVisit, getVisits } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { formatDate } from "@/lib/dates";
import { VisitConfirmPanel, VisitStatusPanel, VisitTrail } from "../visit-panels";
import type { AdminVisit, AdminVisitIndex } from "@/types/api";

export const metadata = buildMetadata({ title: "Visit", path: "/admin/visits", seo: noIndex });

/** A labelled fact, or nothing at all. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;

  return (
    <div className="min-w-0">
      <dt className="text-11-5 font-semibold uppercase tracking-[.06em] text-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-13">{children}</dd>
    </div>
  );
}

export default async function VisitPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;

  let visit: AdminVisit;
  let index: AdminVisitIndex;

  try {
    // The record, and the meta the panels build their selects from — the
    // API's lists, never ones restated here.
    [visit, index] = await Promise.all([getVisit(reference), getVisits({ per_page: 1 })]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that visit">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const canBook = visit.status === "requested" || visit.status === "confirmed";
  const address = visitAddressLine(visit.site_address);

  return (
    <>
      <PageHeader title={visit.name} back={{ href: "/admin/visits", label: "Visits" }}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-mono text-13 text-muted">{visit.reference}</span>
          <VisitStatusBadge status={visit.status} label={visit.status_label} />
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card as="section" interactive={false} padding="sm">
            <h2 className="mb-3 text-13 font-semibold">The visit</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="About">{visit.topic}</Fact>
              <Fact label="Nearest city">{visit.location?.name}</Fact>
              <Fact label="Booked for">{visit.status === "confirmed" && visit.visit_date ? `${visit.visit_date}, ${visit.visit_time}` : null}</Fact>
              <Fact label="Engineer">{visit.assignee_name}</Fact>
              <Fact label="Site">{address}</Fact>
              <Fact label="Cancelled because">{visit.status === "cancelled" ? visit.cancel_reason : null}</Fact>
            </dl>

            <h3 className="mt-4 mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">Times they asked for</h3>
            <ol className="grid gap-1 text-13">
              {visit.preferred.map((p, i) => <li key={`${p.date}-${p.window}`}>{i + 1}. {p.label}</li>)}
            </ol>

            <h3 className="mt-4 mb-2 text-12 font-semibold uppercase tracking-[.06em] text-faint">What they wrote</h3>
            {visit.notes ? (
              // Plain text, never markup: written by a stranger on a public form.
              <p className="whitespace-pre-wrap text-13">{visit.notes}</p>
            ) : (
              <p className="text-13 text-muted">Nothing.</p>
            )}
          </Card>

          <Card as="section" interactive={false} padding="sm">
            <h2 className="mb-3 text-13 font-semibold">Contact</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Name">{visit.name}</Fact>
              <Fact label="Company">{visit.company}</Fact>
              <Fact label="Email">
                <a href={`mailto:${visit.email}`} className="text-brand-ink underline">{visit.email}</a>
              </Fact>
              <Fact label="Mobile">
                <a href={`tel:${visit.phone.replace(/[^\d+]/g, "")}`} className="text-brand-ink underline">{visit.phone}</a>
              </Fact>
              <Fact label="Portal account">{visit.customer_id ? <Link href={`/admin/customers/${visit.customer_id}`} className="text-brand-ink underline">Open the customer</Link> : "Guest"}</Fact>
              <Fact label="Lead">{visit.lead_id ? <Link href={`/admin/leads/${visit.lead_id}`} className="text-brand-ink underline">Open the lead</Link> : null}</Fact>
              <Fact label="Asked from">{visit.source_path ? <span className="font-mono text-12">{visit.source_path}</span> : null}</Fact>
              <Fact label="Received">{formatDate(visit.created_at, "dateTime")}</Fact>
            </dl>
          </Card>

          <VisitTrail visit={visit} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {canBook && (
            <VisitConfirmPanel
              visit={visit}
              assignees={index.meta.assignees}
              defaultMinutes={index.meta.default_minutes}
              windows={index.meta.windows}
            />
          )}
          <VisitStatusPanel key={`${visit.status}:${visit.updated_at}`} visit={visit} assignees={index.meta.assignees} />
        </div>
      </div>
    </>
  );
}
