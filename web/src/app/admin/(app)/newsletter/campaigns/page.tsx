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
        back={{ href: "/admin/newsletter", label: "Newsletter" }}
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
          {result.data.map((c) => (
            <li key={c.id}>
              <Link
                href={c.status === "sent" || c.status === "sending"
                  ? `/admin/newsletter/campaigns/${c.id}/report`
                  : `/admin/newsletter/campaigns/${c.id}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-3 hover:border-faint"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{c.name}</p>
                  <p className="truncate text-[12.5px] text-faint">{c.subject}</p>
                </div>

                {c.health_score !== null && (
                  <span className={`shrink-0 text-[12.5px] tabular-nums ${
                    c.health_score >= 80 ? "text-ok" : c.health_score >= 60 ? "text-warn" : "text-err"
                  }`}>
                    {c.health_score}/100
                  </span>
                )}

                {c.recipient_count > 0 && (
                  <span className="shrink-0 text-[12.5px] tabular-nums text-muted">
                    {c.recipient_count.toLocaleString()} sent
                  </span>
                )}

                <Badge tone={TONE[c.status] ?? "closed"}>{c.status_label}</Badge>
              </Link>
            </li>
          ))}
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
