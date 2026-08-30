import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/input";
import { getCampaignReport } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterReport } from "@/types/api";

export const metadata = buildMetadata({ title: "Campaign report", path: "/admin/newsletter/campaigns", seo: noIndex });

export default async function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let report: NewsletterReport;

  try {
    report = await getCampaignReport(Number(id));
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();

    return <ErrorState title="We could not load this report">The admin API is not responding.</ErrorState>;
  }

  const { counts, rates, campaign } = report;
  const peak = Math.max(1, ...report.timeline.map((h) => Math.max(h.opened, h.clicked)));

  return (
    <>
      <PageHeader
        title={campaign.name}
        back={{ href: "/admin/newsletter/campaigns", label: "Campaigns" }}
        lede={campaign.subject}
      >
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={campaign.status === "sent" ? "resolved" : campaign.status === "sending" ? "progress" : "urgent"}>
            {campaign.status_label}
          </Badge>
          <ButtonLink href={`/admin/newsletter/campaigns/${campaign.id}`} variant="secondary" size="sm">
            Open the campaign
          </ButtonLink>
        </div>
      </PageHeader>

      <section className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Recipients" value={counts.recipients} note="Frozen when it was sent" />
        <Figure label="Delivered" value={counts.sent} note={rate(rates.delivery)} />
        <Figure label="Opened" value={counts.opened} note={rate(rates.open)} />
        <Figure label="Clicked" value={counts.clicked} note={rate(rates.click)} />
      </section>

      <section className="mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Bounced" value={counts.bounced} note={rate(rates.bounce)} tone="err" />
        <Figure label="Failed" value={counts.failed} note="Refused by the mail server" tone={counts.failed > 0 ? "err" : undefined} />
        <Figure label="Skipped" value={counts.skipped} note="Unsubscribed mid-send" />
        <Figure label="Unsubscribed" value={counts.unsubscribed} note={rate(rates.unsubscribe)} />
      </section>

      {/*
        Said plainly and near the numbers rather than in a footnote. An open
        rate is an estimate — a client that pre-fetches images records an open
        nobody made, and one that blocks them records none for somebody who
        read every word.
      */}
      <Alert tone="info" title="How to read these">
        {report.measurement_note}
        {rates.click_to_open !== null && (
          <span className="mt-1 block">
            Of those who opened it, <strong>{rates.click_to_open}%</strong> clicked something —
            which says whether the content worked, where the open rate says whether the subject
            line did.
          </span>
        )}
      </Alert>

      {report.links.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold">Links</h2>

          <table className="admin-table w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] uppercase tracking-[.04em] text-muted">
                <th className="py-2 pr-3 font-semibold">Destination</th>
                <th className="py-2 pr-3 font-semibold">People</th>
                <th className="py-2 font-semibold">Total clicks</th>
              </tr>
            </thead>
            <tbody>
              {report.links.map((link) => (
                <tr key={link.id} className="border-b border-line last:border-0">
                  <td data-label="Destination" className="max-w-[52ch] truncate py-2 pr-3">
                    <span className="font-medium">{link.label ?? "Link"}</span>
                    <span className="block truncate font-mono text-[11.5px] text-faint">{link.url}</span>
                  </td>
                  {/*
                    People first, clicks second. A ranking on total clicks puts
                    one enthusiastic reader above ten interested ones.
                  */}
                  <td data-label="People" className="py-2 pr-3 tabular-nums font-semibold">{link.unique_clicks}</td>
                  <td data-label="Total clicks" className="py-2 tabular-nums text-muted">{link.total_clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.timeline.some((h) => h.opened || h.clicked) && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold">
            The first two days
            <span className="ml-2 font-normal text-faint">opens in blue, clicks in green</span>
          </h2>

          <div className="rounded-lg border border-line-strong bg-card p-3.5">
            <div className="flex h-28 items-end gap-px" aria-hidden>
              {report.timeline.map((hour) => (
                <div key={hour.hour} className="flex h-full flex-1 items-end gap-px">
                  <span className="block flex-1 rounded-t-sm bg-info"
                    style={{ height: `${(hour.opened / peak) * 100}%` }}
                    title={`${hour.opened} opened`} />
                  <span className="block flex-1 rounded-t-sm bg-ok"
                    style={{ height: `${(hour.clicked / peak) * 100}%` }}
                    title={`${hour.clicked} clicked`} />
                </div>
              ))}
            </div>

            {/*
              Side by side, not stacked: an open and a click are different
              events and a stack implies a total that means nothing — the same
              call the ticket dashboard's volume chart makes.
            */}
            <p className="mt-2 text-[11.5px] text-faint">
              Hour by hour from the moment it was sent. Tallest bar is {peak}.
            </p>
          </div>
        </section>
      )}
    </>
  );
}

function rate(value: number | null): string {
  return value === null ? "Not measured" : `${value}%`;
}

function Figure({
  label, value, note, tone,
}: { label: string; value: number; note: string; tone?: "err" }) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-muted">{label}</p>
      <p className={`mt-1 font-display text-[24px] font-semibold leading-none tabular-nums ${tone === "err" ? "text-err" : ""}`}>
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[12px] text-faint">{note}</p>
    </div>
  );
}
