import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { getCustomer } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminCustomer } from "@/types/api";
import { CustomerStatusBadge, VerifiedBadge } from "../status-badge";
import { CustomerActions } from "./customer-actions";
import { DetailsForm } from "./details-form";

export const metadata = buildMetadata({ title: "Customer", path: "/admin/customers", seo: noIndex });

const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * What each action reports once it has happened.
 *
 * Rendered from the URL rather than from the action's return value: the
 * buttons on this screen are conditional on the status they change, so a
 * message returned into one of them is destroyed by its own success. An
 * unrecognised value renders nothing rather than an empty panel.
 */
const DONE: Record<string, { tone: "ok" | "info"; title: string; body: string }> = {
  approved: { tone: "ok", title: "Account activated", body: "They can sign in now, and we have emailed them to say so." },
  rejected: { tone: "info", title: "Registration rejected", body: "Their sessions have ended and they have had a neutral email. The note is staff-only." },
  suspended: { tone: "info", title: "Account suspended", body: "Every session has ended. Their tickets are untouched, and they have not been emailed." },
  reactivated: { tone: "ok", title: "Account is active again", body: "They can sign in with their existing password." },
  resent: { tone: "ok", title: "Confirmation link sent", body: "A fresh link is on its way to them. It expires in 24 hours." },
  saved: { tone: "ok", title: "Details saved", body: "" },
};

export default async function AdminCustomerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { id } = await params;
  const { done } = await searchParams;
  const outcome = done ? DONE[done] : undefined;

  let customer: AdminCustomer;
  try {
    customer = await getCustomer(Number(id));
  } catch {
    notFound();
  }

  return (
    <>
      <PageHeader title={customer.name} back={{ href: "/admin/customers", label: "All customers" }}>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <CustomerStatusBadge status={customer.status} label={customer.status_label} />
          <VerifiedBadge verified={customer.email_verified} />
        </span>
      </PageHeader>

      {outcome && (
        <Alert tone={outcome.tone} title={outcome.title}>{outcome.body}</Alert>
      )}

      {/*
        The note is shown to staff and only to staff. It is a judgement about a
        person, written for colleagues, and the API never returns it on the
        customer-facing resource.
      */}
      {customer.status_note && (
        <Alert tone="info" title="Staff note">{customer.status_note}</Alert>
      )}

      {customer.status === "pending" && !customer.email_verified && (
        <Alert tone="warn" title="This address has never been confirmed">
          Nobody has proved they can read {customer.email}. You can still activate the account —
          if you know this customer, a phone call is better proof than an inbox — but it is worth
          knowing which you are doing.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <h2 className="admin-title mb-3">Contact details</h2>
          <DetailsForm customer={customer} />
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="admin-title mb-1">Account</h2>
            <dl>
              <Row label="Registered">{stamp(customer.created_at)}</Row>
              <Row label="Email confirmed">{stamp(customer.email_verified_at)}</Row>
              <Row label="Activated">{stamp(customer.approved_at)}</Row>
              <Row label="Activated by">{customer.approved_by || "—"}</Row>
              <Row label="Last signed in">{stamp(customer.last_login_at)}</Row>
              <Row label="Tickets">
                {/*
                  Linked rather than stated, because "6 tickets" is the point at
                  which somebody wants to read them — and the ticket queue can
                  already filter by customer.
                */}
                {customer.ticket_count ? (
                  <ButtonLink
                    href={`/admin/tickets?q=${encodeURIComponent(customer.email)}`}
                    variant="ghost"
                    size="sm"
                  >
                    {customer.ticket_count}
                  </ButtonLink>
                ) : (
                  "0"
                )}
              </Row>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="admin-title mb-3">Actions</h2>
            <CustomerActions customer={customer} />
          </Card>
        </div>
      </div>
    </>
  );
}
