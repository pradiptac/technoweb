import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, leadStatusTone } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { getLead, getLeads, type AdminLead, type LeadIndex } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { formatPaise } from "@/lib/money";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LeadDelete, LeadNotes, LeadPipeline, LeadScorePanel } from "../lead-panels";

export const metadata = buildMetadata({ title: "Lead", path: "/admin/leads", seo: noIndex });

/** A labelled fact, or nothing at all. Empty rows are noise on a summary. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;

  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px]">{children}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead: AdminLead;
  let index: LeadIndex;

  try {
    // The record, and the meta the pipeline panel builds its dropdowns from.
    // The options are the API's list, never one restated in TypeScript — the
    // rule `schema_type_options` and `meta.transitions` already follow.
    [lead, index] = await Promise.all([getLead(Number(id)), getLeads({ per_page: 1 })]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    return (
      <ErrorState title="We could not load that lead">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const submission = lead.submission?.data ?? null;

  return (
    <>
      <PageHeader title={lead.name || lead.email || `Lead ${lead.id}`} back={{ href: "/admin/leads", label: "Leads" }}>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={leadStatusTone[lead.status] ?? "closed"}>{lead.status_label}</Badge>
          {lead.is_overdue && <Badge tone="urgent">Overdue</Badge>}
          <LeadDelete id={lead.id} />
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-line-strong bg-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Contact</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Name">{lead.name}</Fact>
              <Fact label="Company">{lead.company}</Fact>
              <Fact label="Email">
                {/* mailto rather than plain text: replying is the single most
                    common thing anybody does from this screen. */}
                {lead.email && <a href={`mailto:${lead.email}`} className="text-brand-ink underline">{lead.email}</a>}
              </Fact>
              <Fact label="Phone">
                {lead.phone && <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="text-brand-ink underline">{lead.phone}</a>}
              </Fact>
              <Fact label="Estimated value">
                {lead.value_paise === null ? null : formatPaise(lead.value_paise)}
              </Fact>
              <Fact label="First replied">
                {lead.contacted_at ? new Date(lead.contacted_at).toLocaleString() : null}
              </Fact>
            </dl>
          </section>

          <section className="rounded-lg border border-line-strong bg-card p-4">
            <h2 className="mb-2 text-[13px] font-semibold">{lead.subject || "What they wrote"}</h2>
            {lead.message ? (
              // Plain text in a `<p>`, never `dangerouslySetInnerHTML`. This is
              // the one piece of content on the site written by an anonymous
              // stranger, and `whitespace-pre-wrap` keeps their paragraphs
              // without giving them markup.
              <p className="whitespace-pre-wrap text-[13px]">{lead.message}</p>
            ) : (
              <p className="text-[13px] text-muted">No message was sent with this enquiry.</p>
            )}

            {/*
              An editor-built form's own answers. The lead's columns hold what
              could be guessed from the obvious field names; for anything else
              this is the only place the answer exists.
            */}
            {submission && Object.keys(submission).length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-[12px] font-semibold uppercase tracking-[.06em] text-faint">
                  Everything they filled in
                </h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(submission).map(([key, value]) => (
                    <Fact key={key} label={key.replace(/_/g, " ")}>{String(value)}</Fact>
                  ))}
                </dl>
              </>
            )}
          </section>

          <section className="rounded-lg border border-line-strong bg-card p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Where it came from</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Form">{lead.form_name}</Fact>
              <Fact label="Page">
                {lead.source_path && (
                  <>
                    {/*
                      A path, so the browser supplies the origin. `FRONTEND_URL`
                      is pinned to the production domain on every machine, which
                      makes it exactly the wrong base for a link a person clicks
                      from the console — it sent a developer to the live site
                      once already.
                    */}
                    <Link href={lead.source_path} className="font-mono text-[12.5px] text-brand-ink underline">
                      {lead.source_path}
                    </Link>
                    {lead.source_title && <span className="block text-[12px] text-muted">{lead.source_title}</span>}
                  </>
                )}
              </Fact>
              <Fact label="Arrived from">{lead.referrer}</Fact>
              <Fact label="Campaign">
                {lead.utm_campaign && (
                  <>
                    {lead.utm_campaign}
                    {(lead.utm_source || lead.utm_medium) && (
                      <span className="block text-[12px] text-muted">
                        {[lead.utm_source, lead.utm_medium].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </>
                )}
              </Fact>
              <Fact label="Received">
                {lead.created_at ? new Date(lead.created_at).toLocaleString() : null}
              </Fact>
              <Fact label="IP address">{lead.ip_address}</Fact>
            </dl>

            {!lead.source_path && (
              <p className="mt-3 text-[12px] text-faint">
                {/* Says which of the two it is, because they want opposite
                    responses: one is a lead that arrived before the feature,
                    the other is a browser that ran no JavaScript. */}
                No page was recorded — this lead either predates source tracking or was sent
                without JavaScript.
              </p>
            )}
          </section>

          {/*
            Everything else this address has sent. Nothing is merged: the second
            message is routinely the one that says what they actually want, and
            folding it into the first would lose it.
          */}
          {lead.related && lead.related.length > 0 && (
            <section className="rounded-lg border border-line-strong bg-card p-4">
              <h2 className="mb-2 text-[13px] font-semibold">
                Also from {lead.email} ({lead.related.length})
              </h2>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {lead.related.map((other) => (
                  <li key={other.id} className="flex flex-wrap items-baseline gap-2">
                    <Link href={`/admin/leads/${other.id}`} className="text-brand-ink underline">
                      {other.subject || other.form_name || `Lead ${other.id}`}
                    </Link>
                    <span className="text-[12px] text-faint">
                      {other.status_label}
                      {other.created_at && ` · ${new Date(other.created_at).toLocaleDateString()}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <LeadNotes lead={lead} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <LeadPipeline lead={lead} statuses={index.meta.statuses} assignees={index.meta.assignees} />
          <LeadScorePanel lead={lead} />
        </div>
      </div>
    </>
  );
}
