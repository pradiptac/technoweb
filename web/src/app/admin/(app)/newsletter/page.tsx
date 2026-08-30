import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { getNewsletterDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { NewsletterDashboard } from "@/types/api";

export const metadata = buildMetadata({ title: "Newsletter", path: "/admin/newsletter", seo: noIndex });

export default async function NewsletterDashboardPage() {
  let data: NewsletterDashboard;

  try {
    data = await getNewsletterDashboard();
  } catch {
    return (
      <ErrorState title="We could not load the newsletter">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { subscribers, campaigns, rates } = data;

  return (
    <>
      <PageHeader
        title="Newsletter"
        lede={<>
          The mailing list and the campaigns sent to it. Everything here goes out through the
          queue, so a send is handed over rather than waited for.
        </>}
      >
        <div className="ml-auto flex gap-2">
          <ButtonLink href="/admin/newsletter/campaigns/new" size="sm">New campaign</ButtonLink>
        </div>
      </PageHeader>

      {/*
        Said once, at the top, where somebody reading a report will see it
        before the numbers rather than after. With tracking off the rates below
        are not low — they are unmeasured, and a zero would say the opposite.
      */}
      {!data.tracking_enabled && (
        <Alert tone="info" title="Open and click tracking is switched off">
          Campaign reports show delivery only. That is a legitimate choice — a pixel and
          rewritten links are personal-data collection — and it can be changed in
          Settings → Newsletter.
        </Alert>
      )}

      <section className="mb-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Subscribers" value={subscribers.total} note={`${subscribers.active} can be mailed`} href="/admin/newsletter/subscribers" />
        <Figure label="Unsubscribed" value={subscribers.unsubscribed} note={`${subscribers.suppressed} on the do-not-mail list`} href="/admin/newsletter/unsubscribes" />
        <Figure label="Bounced" value={subscribers.bounced} note="Removed from future sends" href="/admin/newsletter/subscribers?status=bounced" />
        <Figure label="Campaigns sent" value={campaigns.sent} note={`${campaigns.draft} draft, ${campaigns.scheduled} scheduled`} href="/admin/newsletter/campaigns" />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold">
          Across every campaign sent
          {/*
            The sample beside the rate, always. 100% of two and 100% of two
            hundred are not the same claim, and a percentage with no
            denominator invites the second reading.
          */}
          {rates.sample > 0 && (
            <span className="ml-2 font-normal text-faint">
              from {rates.sample.toLocaleString()} delivered
            </span>
          )}
        </h2>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Rate label="Delivered" value={rates.delivery} />
          <Rate label="Opened" value={rates.open} note="An estimate — see any report" />
          <Rate label="Clicked" value={rates.click} />
          <Rate label="Bounced" value={rates.bounce} invert />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold">Recent campaigns</h2>

          {data.recent_campaigns.length === 0 ? (
            <p className="measure text-[13px] text-muted">Nothing sent yet.</p>
          ) : (
            <ul className="grid gap-2">
              {data.recent_campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/newsletter/campaigns/${c.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-2.5 hover:border-faint"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.name}</span>
                    <Badge tone={c.status === "sent" ? "resolved" : c.status === "sending" ? "progress" : "closed"}>
                      {c.status_label}
                    </Badge>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-faint">
                      {c.recipients.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold">Recently unsubscribed</h2>

          {data.recent_unsubscribes.length === 0 ? (
            <p className="measure text-[13px] text-muted">Nobody has unsubscribed.</p>
          ) : (
            <ul className="grid gap-2">
              {data.recent_unsubscribes.map((u) => (
                <li key={u.email} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{u.email}</span>
                  <span className="shrink-0 text-[12px] text-faint">{u.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Figure({ label, value, note, href }: { label: string; value: number; note: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line-strong bg-card p-3.5 hover:border-faint">
      <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-muted">{label}</p>
      <p className="mt-1 font-display text-[26px] font-semibold leading-none tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[12px] text-faint">{note}</p>
    </Link>
  );
}

/**
 * A rate, or a dash.
 *
 * Null means nothing has been measured, and it must not render as 0% — zero
 * reads as "nobody opened it", which is a claim about the campaign rather than
 * about the absence of data. Same rule the ticket dashboard follows.
 */
function Rate({ label, value, note, invert = false }: { label: string; value: number | null; note?: string; invert?: boolean }) {
  const tone = value === null ? "text-faint"
    : invert ? (value > 5 ? "text-err" : "text-ink")
      : (value >= 20 ? "text-ok" : "text-ink");

  return (
    <div className="rounded-lg border border-line-strong bg-card p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-muted">{label}</p>
      <p className={`mt-1 font-display text-[26px] font-semibold leading-none tabular-nums ${tone}`}>
        {value === null ? "—" : `${value}%`}
      </p>
      <p className="mt-1.5 text-[12px] text-faint">
        {value === null ? "Nothing measured yet" : note ?? " "}
      </p>
    </div>
  );
}
