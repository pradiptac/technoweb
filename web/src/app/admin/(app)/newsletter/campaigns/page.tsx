import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconMail } from "@/components/icons";
import { getNewsletterCampaigns } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { CampaignIndex } from "@/lib/admin";
import { CampaignRowActions } from "./campaign-row-actions";

export const metadata = buildMetadata({ title: "Campaigns", path: "/admin/newsletter/campaigns", seo: noIndex });

const TONE: Record<string, "resolved" | "closed" | "progress" | "urgent" | "open"> = {
  draft: "closed",
  ready: "open",
  scheduled: "open",
  sending: "progress",
  sent: "resolved",
  paused: "progress",
  cancelled: "closed",
  failed: "urgent",
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const params = await searchParams;

  let result: CampaignIndex;

  try {
    result = await getNewsletterCampaigns({
      q: params.q,
      status: params.status,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the campaigns">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        back={{ href: "/admin/newsletter", label: "Campaign" }}
        lede={<>
          A campaign is sent once and cannot be recalled. Sending is refused until it has an
          unsubscribe link, a sender and a plain-text part — checked on the server, at the
          moment you press send.
        </>}
      >
        <div className="ml-auto">
          <ButtonLink href="/admin/newsletter/campaigns/new" size="sm">New campaign</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/newsletter/campaigns">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or subject…" />
        </FilterField>

        <FilterField label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Any status</option>
            {result.meta.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </FilterField>

        <div className="flex gap-2">
          <button type="submit" className="rounded border border-brand-600 bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700">
            Apply
          </button>
        </div>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconMail />} title="No campaigns yet">
          Start one from a template, write it, send a test to yourself, and then send it.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {result.data.map((c) => {
            const p = c.performance;
            /*
              A rate needs its denominator, so it is worked out here from the
              counts rather than sent as a percentage — and it is quoted over
              *delivered* rather than sent, because an open rate that counts
              bounced addresses in its denominator flatters every campaign with
              a bad list, which is exactly the campaign you need to see.
            */
            const rate = (n: number) =>
              p && p.delivered > 0 ? `${Math.round((n / p.delivered) * 100)}%` : "—";
            const sent = p ? p.recipients > 0 : c.recipient_count > 0;

            return (
              <li key={c.id} className="rounded-lg border border-line-strong bg-card">
                <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                  <Link href={`/admin/newsletter/campaigns/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-[13.5px] font-medium">{c.name}</p>
                    <p className="truncate text-[12.5px] text-faint">{c.subject}</p>
                  </Link>

                  {c.health_score !== null && (
                    <span className={`shrink-0 text-[12.5px] tabular-nums ${
                      c.health_score >= 80 ? "text-ok" : c.health_score >= 60 ? "text-warn" : "text-err"
                    }`}>
                      {c.health_score}/100
                    </span>
                  )}

                  <Badge tone={TONE[c.status] ?? "closed"}>{c.status_label}</Badge>

                  {/*
                    Delete on the row, and only where the row carries no
                    figures. See `campaign-row-actions.tsx`: a list is the
                    wrong place to offer a one-press control that destroys a
                    report, and the right place to clear out drafts.
                  */}
                  {!sent && <CampaignRowActions id={c.id} name={c.name} />}
                </div>

                {/*
                  The figures on the row, not only inside the report.

                  "How did that one do" is a question asked about a campaign in
                  the context of the others — a 22% open rate means nothing
                  until you can see that the one before it did 31%. The report
                  is still a click away and holds the per-link detail.
                */}
                {sent && (
                  <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line px-3.5 py-2 text-[12.5px]">
                    <div className="flex items-baseline gap-1.5">
                      <dt className="text-faint">Sent</dt>
                      <dd className="font-medium tabular-nums">{(p?.recipients ?? c.recipient_count).toLocaleString()}</dd>
                    </div>
                    {p && (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-faint">Delivered</dt>
                          <dd className="font-medium tabular-nums">{p.delivered.toLocaleString()}</dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-faint">Opened</dt>
                          <dd className="font-medium tabular-nums">{rate(p.opened)}</dd>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <dt className="text-faint">Clicked</dt>
                          <dd className="font-medium tabular-nums">{rate(p.clicked)}</dd>
                        </div>
                        {p.bounced > 0 && (
                          <div className="flex items-baseline gap-1.5">
                            <dt className="text-faint">Bounced</dt>
                            <dd className="font-medium tabular-nums text-warn">{p.bounced.toLocaleString()}</dd>
                          </div>
                        )}
                      </>
                    )}
                    <Link
                      href={`/admin/newsletter/campaigns/${c.id}/report`}
                      className="ml-auto font-semibold text-brand-ink underline"
                    >
                      Full report
                    </Link>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        meta={result.meta}
        basePath="/admin/newsletter/campaigns"
        params={{ q: params.q, status: params.status, per_page: params.per_page }}
      />
    </>
  );
}
