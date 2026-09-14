import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/empty";
import { Badge, verificationTone } from "@/components/ui/badge";
import { StatTile } from "@/components/admin/stat-tile";
import { IconCheck, IconAlert, IconClose, IconClock } from "@/components/icons";
import { getNewsletterVerification } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { EmailVerification, NewsletterVerificationReport } from "@/types/api";
import { VerificationDonut } from "./verification-donut";
import { Card } from "@/components/ui/card";

export const metadata = buildMetadata({ title: "Verification", path: "/admin/newsletter/verification", seo: noIndex });

/**
 * What Hunter has said about the list, what the month's allowance has left,
 * and what is waiting.
 *
 * Every figure here is read from stored rows; the one exception, Hunter's own
 * used/available count, is an hour old at most and is shown beside the local
 * count rather than instead of it — the local cap is what the client decided
 * to spend, Hunter's figure is what the plan will actually allow, and the
 * nightly run stops at whichever is lower.
 */
export default async function VerificationPage() {
  let data: NewsletterVerificationReport;

  try {
    data = await getNewsletterVerification();
  } catch {
    return (
      <ErrorState title="We could not load the verification report">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const { breakdown, month, hunter, queue } = data;
  const unsendable = breakdown.invalid + breakdown.disposable;

  return (
    <>
      <PageHeader
        title="Verification"
        back={{ href: "/admin/newsletter", label: "Campaign" }}
        lede={<>
          New addresses are checked with Hunter a few at a time, overnight, and never the same
          address twice. Invalid and disposable ones are left off every campaign; nothing here
          touches the do-not-mail list, and any address can be checked again by hand.
        </>}
      />

      {data.error && (
        <Alert tone="err" title="The last check did not run">
          {data.error} — check the key under{" "}
          <Link href="/admin/settings?tab=integrations" className="font-semibold underline">Settings → API keys</Link>,
          then press <em>Test the key</em> there. The next successful check clears this.
        </Alert>
      )}

      {!data.configured && (
        <Alert tone="info" title="Verification is off">
          No Hunter API key is saved. Add one under{" "}
          <Link href="/admin/settings?tab=integrations" className="font-semibold underline">Settings → API keys</Link>{" "}
          and checking starts on the next nightly run. What was checked before stays recorded below.
        </Alert>
      )}

      {data.configured && data.paused && (
        <Alert tone="warn" title="Checking is paused">
          The monthly allowance is set to 0 under Settings → Newsletter. Nothing is asked until it
          is raised.
        </Alert>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone={breakdown.verified > 0 ? "ok" : "neutral"}
          icon={IconCheck}
          label="Verified"
          value={breakdown.verified.toLocaleString()}
          note="A mailbox that exists"
          href="/admin/newsletter/subscribers?verification=verified"
        />
        <StatTile
          tone={breakdown.risky > 0 ? "warn" : "neutral"}
          icon={IconAlert}
          label="Risky"
          value={breakdown.risky.toLocaleString()}
          note="Cannot be confirmed; still mailed"
          href="/admin/newsletter/subscribers?verification=risky"
        />
        <StatTile
          tone={unsendable > 0 ? "err" : "neutral"}
          icon={IconClose}
          label="Left off campaigns"
          value={unsendable.toLocaleString()}
          note={`${breakdown.invalid.toLocaleString()} invalid, ${breakdown.disposable.toLocaleString()} disposable`}
          href="/admin/newsletter/subscribers?verification=invalid"
        />
        <StatTile
          tone={queue.waiting > 0 ? "info" : "neutral"}
          icon={IconClock}
          label="Waiting"
          value={queue.waiting.toLocaleString()}
          note={
            queue.waiting === 0 ? "Everything has been checked"
              : queue.estimated_days === null ? "Checking is paused"
                : `About ${queue.estimated_days} day${queue.estimated_days === 1 ? "" : "s"} at this plan`
          }
          href="/admin/newsletter/subscribers?verification=unverified"
        />
      </section>

      <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card as="section" interactive={false} padding="sm">
          <h2 className="mb-3 text-13 font-semibold">How the checked addresses break down</h2>
          <VerificationDonut breakdown={breakdown} />
        </Card>

        <Card as="section" interactive={false} padding="sm">
          <h2 className="mb-3 text-13 font-semibold">This month&rsquo;s allowance</h2>
          <p className="font-display text-[26px] leading-none font-semibold tracking-[-.02em] tabular-nums">
            {month.used.toLocaleString()}
            <span className="text-15 font-medium text-muted"> of {month.cap.toLocaleString()} used</span>
          </p>
          {/*
            A bar, not a percentage: "37 of 100" is already the number, and
            what somebody wants to see is how much of the strip is left.
          */}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className={month.remaining === 0 ? "h-full bg-err" : "h-full bg-brand-500"}
              style={{ width: `${month.cap === 0 ? 0 : Math.min(100, (month.used / month.cap) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-13 text-ink-2">
            {month.remaining.toLocaleString()} left, {month.days_left} day{month.days_left === 1 ? "" : "s"} to
            go &mdash; about {month.per_day} a night. Resets on {month.resets_on}.
          </p>
          <p className="mt-3 text-12-5 text-muted">
            {hunter ? (
              <>
                Hunter says {hunter.used.toLocaleString()} used and {hunter.available.toLocaleString()} available
                {hunter.plan_name ? ` on the ${hunter.plan_name} plan` : ""}
                {hunter.reset_date ? `, resetting ${hunter.reset_date}` : ""}. The nightly run stops at
                whichever of the two figures is lower.
              </>
            ) : data.configured ? (
              <>Hunter has not answered for its own figures yet &mdash; press <em>Test the key</em> in Settings.</>
            ) : (
              <>Hunter&rsquo;s own figures appear here once a key is saved.</>
            )}
          </p>
          <p className="mt-3 text-12-5 text-faint">
            Last run: {data.last_run_at ? new Date(data.last_run_at).toLocaleString() : "not yet"}. It runs
            every night at 03:55.
          </p>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-13 font-semibold">The last twenty answers</h2>
        {data.recent.length === 0 ? (
          <p className="measure text-13 text-muted">Nothing has been asked yet.</p>
        ) : (
          <table className="admin-table w-full min-w-[640px] text-13">
            <thead>
              <tr className="border-b border-line text-left text-12 uppercase tracking-[.04em] text-muted">
                <th className="py-2 pr-3 font-semibold">Email</th>
                <th className="py-2 pr-3 font-semibold">Answer</th>
                <th className="py-2 pr-3 font-semibold">Score</th>
                <th className="py-2 pr-3 font-semibold">How</th>
                <th className="py-2 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td data-label="Email" className="py-2 pr-3 font-mono text-12-5">{r.email}</td>
                  <td data-label="Answer" className="py-2 pr-3"><Answer status={r.status} http={r.http_status} /></td>
                  <td data-label="Score" className="py-2 pr-3 tabular-nums">{r.score ?? <span className="text-faint">—</span>}</td>
                  <td data-label="How" className="py-2 pr-3 text-muted">
                    {r.source === "ledger" ? "Copied from an earlier check" : r.source === "manual" ? "Re-check" : "Nightly"}
                  </td>
                  <td data-label="When" className="py-2 text-12-5 text-faint">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

/** Hunter's raw word as a badge in the verdict's tone, or the refusal it gave instead. */
function Answer({ status, http }: { status: string | null; http: number }) {
  const verdict: EmailVerification | null =
    status === "valid" || status === "webmail" ? "verified"
      : status === "accept_all" || status === "unavailable" ? "risky"
        : status === "invalid" ? "invalid"
          : status === "disposable" ? "disposable"
            : status === "unknown" ? "pending"
              : null;

  if (verdict) {
    return <Badge tone={verificationTone[verdict]}>{status}</Badge>;
  }

  const why = http === 0 ? "no answer" : http === 401 ? "bad key" : http === 429 ? "limit reached" : `HTTP ${http}`;
  return <span className="inline-flex items-center gap-1 text-12-5 text-err"><IconAlert aria-hidden className="size-3.5" />{why}</span>;
}
