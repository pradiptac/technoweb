import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { getChatDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireScreen } from "@/lib/admin-screen";
import { StatTile } from "@/components/admin/stat-tile";
import { BarList } from "@/components/charts/bar-list";
import { IconChat, IconAlert, IconPhone, IconThumbsUp } from "@/components/icons";

export const metadata = buildMetadata({ title: "Website assistant", path: "/admin/chat", seo: noIndex });

type SearchParams = { from?: string; to?: string };

/**
 * A figure and what it is — the console's `StatTile` since 2026-10-05.
 *
 * `—` for a figure nobody measured, never a zero: a helpfulness rate over no
 * ratings is not 0%, and an assistant nobody has rated would otherwise read as
 * one everybody hated. Untoned figures are neutral for the same reason.
 */
function Total({ label, value, note, tone, icon }: {
  label: string; value: string; note?: string; tone?: "ok" | "warn" | "brand";
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}) {
  return <StatTile label={label} value={value} note={note} tone={tone ?? "neutral"} icon={icon} />;
}

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function ChatDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  const report = await getChatDashboard(params).catch(() => null);

  if (!report) {
    return (
      <ErrorState title="We could not load the assistant's figures">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Website assistant"
        lede="What visitors asked, what the website could not answer, and what came of it. The unanswered list is the useful one: every line is a question somebody asked that the site does not answer, which is a page worth writing."
      />

      <FilterBar action="/admin/chat">
        <FilterField label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={report.from} className="w-[150px]" />
        </FilterField>
        <FilterField label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={report.to} className="w-[150px]" />
        </FilterField>
        <Button type="submit" className="mb-[1px]">Show</Button>
      </FilterBar>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Total label="Conversations" tone="brand" icon={IconChat} value={String(report.conversations)}
          note={`${report.questions} question${report.questions === 1 ? "" : "s"} asked`} />
        <Total label="Could not answer" tone="warn" icon={IconAlert} value={String(report.unanswered)}
          note={report.unanswered_rate === null ? "Nothing asked yet" : `${pct(report.unanswered_rate)} of questions`} />
        <Total label="Callbacks asked for" tone="ok" icon={IconPhone} value={String(report.leads)}
          note={report.lead_rate === null ? "No conversations yet" : `${pct(report.lead_rate)} of conversations`} />
        <Total label="Rated helpful" icon={IconThumbsUp} value={pct(report.helpful_rate)}
          note={report.rated === 0 ? "Nobody has rated an answer" : `Across ${report.rated} rating${report.rated === 1 ? "" : "s"}`} />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card as="section" interactive={false} padding="sm">
          <h2 className="mb-1 text-13 font-semibold">What they came for</h2>
          <p className="mb-3 text-11-5 text-faint">
            Read off what was recorded at the time, so this and the buttons somebody was
            shown cannot disagree.
          </p>
          <BarList
            empty="Nothing asked in this range."
            rows={report.by_intent.map((row) => ({
              label: row.intent.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
              value: row.total,
            }))}
          />
        </Card>

        <Card as="section" interactive={false} padding="sm">
          <h2 className="mb-1 text-13 font-semibold">Where conversations start</h2>
          <p className="mb-3 text-11-5 text-faint">
            A page generating conversations is a page not answering its own question.
          </p>
          <BarList
            empty="No conversation has started yet."
            labelWidth="10rem"
            rows={report.busiest_pages.map((row) => ({ label: row.path, value: row.total, tone: "info", href: row.path }))}
          />
        </Card>
      </div>

      <p className="mt-4 text-12-5 text-muted">
        <Link href="/admin/chat/unanswered" className="font-semibold text-brand-ink hover:underline">
          Questions it could not answer
        </Link>{" "}
        ·{" "}
        <Link href="/admin/chat/conversations" className="font-semibold text-brand-ink hover:underline">
          Every conversation
        </Link>
        {" "}· {report.tokens.toLocaleString("en-IN")} tokens used in this range
      </p>

      {/*
        Today, against the ceiling — deliberately outside the date filter,
        because the question it answers is "will it still be answering this
        afternoon" and that is not a question about a range.

        Until this existed the cap was invisible: the first sign of a day
        running out was visitors being turned away. Same shape as `pending: 0`
        describing a healthy install and one with no cron entry identically.
      */}
      <section className="mt-4 rounded-lg border border-line-strong bg-card p-4">
        <h2 className="mb-1 text-13 font-semibold">Today</h2>
        {report.today.cap > 0 && (
          /* The ceiling as a gauge: how much of today's allowance is gone. */
          <div
            role="meter"
            aria-label="Replies used today"
            aria-valuemin={0}
            aria-valuemax={report.today.cap}
            aria-valuenow={Math.min(report.today.replies, report.today.cap)}
            className="mb-2.5 h-2.5 overflow-hidden rounded-full bg-surface-2"
          >
            <span
              data-chart-grow
              className={cn("block h-full rounded-full", report.today.reached ? "bg-err" : report.today.replies / report.today.cap > 0.8 ? "bg-warn" : "bg-ok")}
              style={{ width: `${Math.min(100, (report.today.replies / report.today.cap) * 100)}%` }}
            />
          </div>
        )}
        <p className="text-12-5 text-muted">
          {report.today.cap === 0 ? (
            <>
              <strong className="text-ink">{report.today.replies.toLocaleString("en-IN")}</strong>{" "}
              replies so far, and <strong className="text-ink">no daily ceiling is set</strong> —
              which somebody chose deliberately, and which means nothing bounds a bad afternoon
              except the per-visitor rate limits.
            </>
          ) : report.today.reached ? (
            <>
              The daily ceiling of {report.today.cap.toLocaleString("en-IN")} replies{" "}
              <strong className="text-err">has been reached</strong>. The assistant is telling
              visitors it is unavailable until tomorrow and pointing them at the contact form.
              Raise{" "}
              <Link href="/admin/chat/settings?tab=chatbot#setting__chatbot_daily_reply_cap" className="font-semibold text-brand-ink hover:underline">
                Replies per day
              </Link>{" "}
              in Assistant → Settings if that is not what you want.
            </>
          ) : (
            <>
              <strong className="text-ink">{report.today.replies.toLocaleString("en-IN")}</strong> of{" "}
              {report.today.cap.toLocaleString("en-IN")} replies used
              {report.today.remaining !== null && (
                <> — {report.today.remaining.toLocaleString("en-IN")} left before it stops
                answering for the day</>
              )}
              .
            </>
          )}
          {" "}
          {report.today.tokens.toLocaleString("en-IN")} tokens today, which is what the provider
          bills for — the cap counts replies, so a day of long conversations costs more than a
          day of short ones at the same count.
        </p>
      </section>
    </>
  );
}
