import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { getNewsletterDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StatTile, type Tone } from "@/components/admin/stat-tile";
import {
  IconUsers, IconEyeOff, IconClose, IconMail, IconTeam, IconChart, IconCheck, IconEye,
  IconArrowRight,
} from "@/components/icons";
import type { NewsletterDashboard } from "@/types/api";

export const metadata = buildMetadata({ title: "Campaign", path: "/admin/newsletter", seo: noIndex });

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
        title="Campaign"
        lede={<>
          The mailing list and the campaigns sent to it. Everything here goes out through the
          queue, so a send is handed over rather than waited for.
        </>}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          {/* Importing is how most people start, so it is on the first screen
              rather than two clicks inside Subscribers. */}
          <ButtonLink href="/admin/newsletter/subscribers/import" variant="secondary" size="sm">
            Import subscribers
          </ButtonLink>
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

      {/*
        Tinted by what each figure means, not for decoration.

        Subscribers is the list itself and takes the brand; the two that describe
        people leaving are amber and red; campaigns sent is neutral information.
        Every one of them is a link to the list it counts, which is what earns
        the hover — a figure somebody cannot open sends them hunting for a
        filter, the argument `?check=` on the SEO overview already makes.
      */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone="brand"
          icon={IconUsers}
          label="Subscribers"
          value={subscribers.total.toLocaleString()}
          note={`${subscribers.active.toLocaleString()} can be mailed`}
          href="/admin/newsletter/subscribers"
        />
        <StatTile
          /*
            Coloured only when there is something to colour.

            A red tile reading "0 bounced" invents an alarm that is not there —
            the rule the ticket dashboard sets out for its overdue count — and
            it was worse than that here: "Bounced" appeared twice on this screen,
            red as a count and green as a rate, so one word had two colours a
            hand's width apart. Zero is neutral in both places now.
          */
          tone={subscribers.unsubscribed > 0 ? "warn" : "neutral"}
          icon={IconEyeOff}
          label="Unsubscribed"
          value={subscribers.unsubscribed.toLocaleString()}
          note={`${subscribers.suppressed.toLocaleString()} on the do-not-mail list`}
          href="/admin/newsletter/unsubscribes"
        />
        <StatTile
          tone={subscribers.bounced > 0 ? "err" : "neutral"}
          icon={IconClose}
          label="Bounced"
          value={subscribers.bounced.toLocaleString()}
          note="Removed from future sends"
          href="/admin/newsletter/subscribers?status=bounced"
        />
        <StatTile
          tone="info"
          icon={IconMail}
          label="Campaigns sent"
          value={campaigns.sent.toLocaleString()}
          note={`${campaigns.draft} draft, ${campaigns.scheduled} scheduled`}
          href="/admin/newsletter/campaigns"
        />
      </section>

      {/*
        Groups earn a line of their own rather than a figure card: a campaign
        is sent to groups, so with none there is nobody to send to — and the
        thing somebody needs at that moment is the way to make one, not a
        count of zero.
      */}
      <section className="mb-6 flex items-start gap-3 rounded-lg border border-info/25 bg-info-soft px-4 py-3">
        <IconTeam aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
        <p className="measure text-[13px] text-ink-2">
          A campaign goes to one or more <Link href="/admin/newsletter/groups" className="font-semibold text-brand-ink underline">groups</Link>.
          Somebody can be in several — a campaign sent to three overlapping groups still sends
          one email per person.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <IconChart aria-hidden className="size-4 text-info" />
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Rate label="Delivered" value={rates.delivery} icon={IconCheck} good={95} />
          <Rate label="Opened" value={rates.open} icon={IconEye} good={20} note="An estimate — see any report" />
          <Rate label="Clicked" value={rates.click} icon={IconArrowRight} good={3} />
          <Rate label="Bounced" value={rates.bounce} icon={IconClose} invert bad={5} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <IconMail aria-hidden className="size-4 text-brand-ink" />
            Recent campaigns
          </h2>

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
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <IconEyeOff aria-hidden className="size-4 text-warn" />
            Recently unsubscribed
          </h2>

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

/**
 * A rate, or a dash.
 *
 * Null means nothing has been measured, and it must not render as 0% — zero
 * reads as "nobody opened it", which is a claim about the campaign rather than
 * about the absence of data. Same rule the ticket dashboard follows.
 *
 * **The tone follows the figure**, which is why it is not passed in: a delivery
 * rate of 99% and one of 60% are not the same news, and a tile that is the same
 * colour either way is decoration. `neutral` when there is nothing to judge,
 * because a hue there would be the screen making a claim the data does not
 * support.
 */
function Rate({
  label, value, note, icon, invert = false, good, bad,
}: {
  label: string;
  value: number | null;
  note?: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
  /** True where a *high* number is the bad one — a bounce rate. */
  invert?: boolean;
  good?: number;
  bad?: number;
}) {
  const tone: Tone =
    value === null ? "neutral"
      // Zero is neutral rather than green, so the count tile above and this
      // one agree about the same word.
      : invert ? (value === 0 ? "neutral" : value > (bad ?? 5) ? "err" : "ok")
        : (value >= (good ?? 20) ? "ok" : "neutral");

  return (
    <StatTile
      tone={tone}
      icon={icon}
      label={label}
      value={value === null ? "—" : `${value}%`}
      note={value === null ? "Nothing measured yet" : note}
    />
  );
}
