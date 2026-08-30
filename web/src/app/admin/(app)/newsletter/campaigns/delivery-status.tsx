import { Alert } from "@/components/ui/input";
import type { QueueHealth } from "@/types/api";

/*
  The cron entry, spelled out where somebody is about to need it.

  `/path/to/api` rather than a guess: the document root is a Plesk decision
  and inventing one produces a line that looks authoritative and does not
  work. The deploy notes in README.md carry the same line.
*/
const CRON = "* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1";

function ago(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;

  const minutes = Math.round(seconds / 60);

  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);

  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/**
 * Whether anything will actually deliver this send.
 *
 * The question the send screen could not answer, and the one somebody asks
 * only after pressing Send and watching a campaign sit at "Sending" for an
 * afternoon. A campaign leaves through queued jobs; a *test* goes out inside
 * the request — which is why "the test arrived and the campaign did not" is
 * the signature of a stopped queue and of nothing else.
 *
 * The backlog cannot answer it beforehand: before a send there is nothing
 * queued to be late, so `pending: 0` is what a healthy install and an install
 * with no cron entry both look like. Two pulses answer it instead — the
 * scheduler's, and a worker's own — because **either** delivers mail, and a
 * check that knew only about the scheduler told somebody running
 * `queue:work` that nothing was delivering. That is worse than saying
 * nothing: it sends them to fix a cron entry they may not need.
 */
export function DeliveryStatus({ queue }: { queue: QueueHealth | null }) {
  // The action returns null when the request failed. Nothing is a better
  // answer than a guess on a panel whose whole job is saying what is true.
  if (queue === null || queue.scheduler?.known !== true) return null;

  const worker = queue.worker;
  const scheduler = queue.scheduler;
  const pending = queue.pending ?? 0;
  const waiting = pending > 0
    ? `, with ${pending} message${pending === 1 ? "" : "s"} waiting`
    : "";

  if (queue.delivering) {
    // Which one, because "it is running" and "how" are different questions and
    // only the second is any use on the morning it stops.
    const via = worker?.running
      ? `A queue worker is running — last seen ${ago(worker.last_seen_seconds ?? 0)}`
      : `The scheduler is running — it last ran ${ago(scheduler.last_run_seconds ?? 0)}`;

    return (
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ok-fill" />
        <span>
          <strong className="font-semibold text-ok">Delivery is running.</strong>{" "}
          {via}{waiting}.
        </span>
      </p>
    );
  }

  const seen = (label: string, age: number | null | undefined) =>
    age === null || age === undefined ? `no ${label}` : `${label} last seen ${ago(age)}`;

  return (
    <Alert tone="warn" title="Nothing is delivering mail right now" dismissible={false}>
      <p>
        A campaign is sent by background jobs, so this one will be accepted and then sit at
        &ldquo;Sending&rdquo; until something drains the queue — nothing will be lost, and
        nothing will arrive either.
        {pending > 0 && ` ${pending} message${pending === 1 ? " is" : "s are"} already waiting.`}
      </p>

      <p className="mt-2">On the server, add this one cron entry:</p>

      {/* Wide content scrolls inside its own box rather than the page. */}
      <pre className="mt-1 overflow-x-auto rounded border border-warn/25 bg-surface px-2.5 py-2 text-[12px] text-ink">
        <code>{CRON}</code>
      </pre>

      <p className="mt-2">
        Or run a worker yourself: <code className="font-mono">php artisan queue:work</code>{" "}
        delivers immediately and counts just as well —{" "}
        <code className="font-mono">php artisan schedule:work</code> mirrors what the server
        does.
      </p>

      <p className="mt-2 text-[12px]">
        {seen("scheduler", scheduler.last_run_seconds)}; {seen("worker", worker?.last_seen_seconds)}.
      </p>
    </Alert>
  );
}
