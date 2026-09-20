"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import type { NewsletterCampaign } from "@/types/api";
import { decideCampaignAction } from "../actions";

/**
 * A subject test in flight, and the control to end it early.
 *
 * Shown on the Send tab while a campaign that tests two subjects is
 * `sending`: sent and opened per line so far, how many are waiting, and
 * when the scheduler will decide. Three buttons end it now — by the numbers
 * as the scheduler would, or naming a line outright, which is for the case
 * where somebody knows something the opens do not (a typo in B, a sale that
 * ended). Once decided, the panel says which line won and steps aside; the
 * report keeps the figures.
 *
 * The outcome arrives as the refreshed campaign from the action, so nothing
 * here guesses at what the API did.
 */
export function SubjectTestPanel({ campaign }: { campaign: NewsletterCampaign }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ab = campaign.ab;

  if (!ab || !campaign.subject_b) return null;

  const rate = (v: { sent: number; opened: number }) => (v.sent > 0 ? `${Math.round((v.opened / v.sent) * 100)}%` : "—");

  const decide = (winner?: "a" | "b") => {
    setError(null);
    start(async () => {
      const result = await decideCampaignAction(campaign.id, winner);
      if (result.error) setError(result.error);
    });
  };

  return (
    <section className="border-t border-line pt-4">
      <h2 className="mb-1.5 flex items-center gap-2 text-13 font-semibold">
        Subject test
        {ab.winner ? <Badge tone="open">Decided: {ab.winner.toUpperCase()}</Badge> : <Badge tone="progress">Running</Badge>}
      </h2>

      <table className="mb-2 w-full text-12-5">
        <thead>
          <tr className="text-left text-faint">
            <th className="py-1 font-medium">Line</th>
            <th className="py-1 font-medium">Subject</th>
            <th className="py-1 text-right font-medium">Sent</th>
            <th className="py-1 text-right font-medium">Opened</th>
            <th className="py-1 text-right font-medium">Rate</th>
          </tr>
        </thead>
        <tbody>
          {(["a", "b"] as const).map((v) => (
            <tr key={v} className={ab.winner === v ? "font-semibold" : undefined}>
              <td className="py-1 font-mono">{v.toUpperCase()}</td>
              <td className="py-1">{v === "a" ? campaign.subject : campaign.subject_b}</td>
              <td className="py-1 text-right tabular-nums">{ab.variants[v].sent}</td>
              <td className="py-1 text-right tabular-nums">{ab.variants[v].opened}</td>
              <td className="py-1 text-right tabular-nums">{rate(ab.variants[v])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {ab.winner ? (
        <p className="text-12-5 text-muted">
          Line {ab.winner.toUpperCase()} went to everyone else
          {ab.decided_at ? ` on ${formatDate(ab.decided_at, "dateTime")}` : ""}.
        </p>
      ) : (
        <>
          <p className="measure mb-2 text-12-5 text-muted">
            {ab.held} {ab.held === 1 ? "person is" : "people are"} waiting. The better-opened line goes to them
            {ab.decide_at ? ` at ${formatDate(ab.decide_at, "dateTime")}` : " when the wait is up"}, or now:
          </p>

          {error && <Alert tone="err" title="Not decided">{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" pending={pending} onClick={() => decide()}>
              Decide by the numbers now
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide("a")}>
              Send A to the rest
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => decide("b")}>
              Send B to the rest
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
