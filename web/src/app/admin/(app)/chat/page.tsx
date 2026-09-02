import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { getChatDashboard } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { cn } from "@/lib/utils";

export const metadata = buildMetadata({ title: "Website assistant", path: "/admin/chat", seo: noIndex });

type SearchParams = { from?: string; to?: string };

/**
 * A figure and what it is. Same shape as the sales and stock reports.
 *
 * `—` for a figure nobody measured, never a zero: a helpfulness rate over no
 * ratings is not 0%, and an assistant nobody has rated would otherwise read as
 * one everybody hated.
 */
function Total({ label, value, note, tone }: {
  label: string; value: string; note?: string; tone?: "ok" | "warn" | "brand";
}) {
  return (
    <div className="rounded-lg border border-line-strong bg-card p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn(
        "mt-1 font-display text-[24px] leading-none font-semibold tracking-[-.02em] tabular-nums",
        tone === "ok" && "text-ok",
        tone === "warn" && "text-warn",
        tone === "brand" && "text-brand-ink",
      )}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function ChatDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
        <Total label="Conversations" tone="brand" value={String(report.conversations)}
          note={`${report.questions} question${report.questions === 1 ? "" : "s"} asked`} />
        <Total label="Could not answer" tone="warn" value={String(report.unanswered)}
          note={report.unanswered_rate === null ? "Nothing asked yet" : `${pct(report.unanswered_rate)} of questions`} />
        <Total label="Callbacks asked for" tone="ok" value={String(report.leads)}
          note={report.lead_rate === null ? "No conversations yet" : `${pct(report.lead_rate)} of conversations`} />
        <Total label="Rated helpful" value={pct(report.helpful_rate)}
          note={report.rated === 0 ? "Nobody has rated an answer" : `Across ${report.rated} rating${report.rated === 1 ? "" : "s"}`} />
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <section className="rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-1 text-[13px] font-semibold">What they came for</h2>
          <p className="mb-3 text-[11.5px] text-faint">
            Read off what was recorded at the time, so this and the buttons somebody was
            shown cannot disagree.
          </p>
          <ul className="grid gap-2">
            {report.by_intent.map((row) => (
              <li key={row.intent} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-[13px] last:border-0 last:pb-0">
                <span className="capitalize">{row.intent}</span>
                <span className="tabular-nums">{row.total}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-line-strong bg-card p-4">
          <h2 className="mb-1 text-[13px] font-semibold">Where conversations start</h2>
          <p className="mb-3 text-[11.5px] text-faint">
            A page generating conversations is a page not answering its own question.
          </p>
          {report.busiest_pages.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Nothing yet.</p>
          ) : (
            <ul className="grid gap-2">
              {report.busiest_pages.map((row) => (
                <li key={row.path} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-[13px] last:border-0 last:pb-0">
                  <Link href={row.path} className="max-w-[36ch] truncate font-mono text-[12.5px] hover:text-brand-ink">
                    {row.path}
                  </Link>
                  <span className="tabular-nums">{row.total}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-[12.5px] text-muted">
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
        <h2 className="mb-1 text-[13px] font-semibold">Today</h2>
        <p className="text-[12.5px] text-muted">
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
              Raise <code className="font-mono text-[12px]">chatbot_daily_reply_cap</code> in
              Settings if that is not what you want.
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
