import { TONE_BAR, TONE_STROKE, verificationTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmailVerification } from "@/types/api";

/**
 * The "round statistics": how the list breaks down by Hunter's verdict.
 *
 * A server-rendered SVG ring, no client JavaScript. Each non-zero verdict is
 * one `<circle pathLength={100}>` whose dash is its share, offset by the
 * shares before it, drawn with a stroke class from `TONE_STROKE` — so the
 * segment and the badge in the legend beside it are one colour by
 * construction, and no hex ever appears here. A one-unit gap between
 * segments is the 2px surface gap a stacked fill wants; the track underneath
 * is `surface-2`, which is what shows through the gaps.
 *
 * Three things the audits shaped. The figure in the centre is HTML laid over
 * the SVG, not `<text>`: SVG text is measured after viewBox scaling and lands
 * under the phone audit's 12px floor. The legend carries the count and the
 * percentage for every verdict, so colour is never the only channel. And the
 * empty state draws one full `stroke-muted` ring rather than nothing — a
 * blank where a chart should be reads as a broken screen.
 */
const ORDER: EmailVerification[] = ["verified", "risky", "invalid", "disposable", "pending", "unverified"];

const LABEL: Record<EmailVerification, string> = {
  verified: "Verified",
  risky: "Risky",
  invalid: "Invalid",
  disposable: "Disposable",
  pending: "Checking",
  unverified: "Not checked",
};

const NOTE: Partial<Record<EmailVerification, string>> = {
  verified: "a mailbox that exists",
  risky: "cannot be confirmed; still mailed",
  invalid: "left off every campaign",
  disposable: "throwaway; left off every campaign",
  pending: "asked again on a later pass",
  unverified: "waiting its turn",
};

export function VerificationDonut({ breakdown }: { breakdown: Record<EmailVerification, number> }) {
  const total = ORDER.reduce((n, k) => n + (breakdown[k] ?? 0), 0);
  const checked = total - (breakdown.unverified ?? 0) - (breakdown.pending ?? 0);

  // The ring is drawn from the verdicts only; what has not been asked yet is
  // in the legend and not in the picture — a ring that is 90% "not checked"
  // says nothing about the list, only about the queue.
  // Each segment carries its own start, worked out once here rather than
  // accumulated while rendering — the compiler refuses a variable mutated
  // inside the map, and it is right: a render is a pure function of its input.
  const segments = ORDER
    .filter((k) => k !== "unverified" && k !== "pending" && (breakdown[k] ?? 0) > 0)
    .reduce<{ key: EmailVerification; count: number; share: number; offset: number }[]>((acc, k) => {
      const share = (breakdown[k] / Math.max(1, checked)) * 100;
      const offset = acc.reduce((n, s) => n + s.share, 0);
      return [...acc, { key: k, count: breakdown[k], share, offset }];
    }, []);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-[172px] shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="40" fill="none" strokeWidth="12" className="stroke-surface-2" />
          {segments.map((s) => {
            // One unit held back so segments do not touch; a single segment
            // keeps the whole ring, since a gap in a full circle is a defect.
            const gap = segments.length > 1 ? 1 : 0;
            const dash = Math.max(0, s.share - gap);
            return (
              <circle
                key={s.key}
                cx="50" cy="50" r="40" fill="none" strokeWidth="12"
                pathLength={100}
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={-s.offset}
                className={TONE_STROKE[verificationTone[s.key]]}
              >
                <title>{`${LABEL[s.key]}: ${s.count.toLocaleString()} (${Math.round(s.share)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-[26px] leading-none font-semibold tracking-[-.02em] tabular-nums text-ink">
              {checked.toLocaleString()}
            </p>
            <p className="mt-1 text-12 text-muted">{checked === 0 ? "none checked yet" : "checked"}</p>
          </div>
        </div>
      </div>

      {/*
        `basis-56`: beside the ring while there is room, under it when there
        is not. A grid row's minimum is its min-content, and "Disposable" plus
        its count does not fit the 100px a phone leaves beside a 172px ring.
      */}
      <dl className="grid min-w-0 flex-1 basis-56 gap-1.5 text-13">
        {ORDER.map((k) => {
          const count = breakdown[k] ?? 0;
          const inRing = k !== "unverified" && k !== "pending";
          const pct = inRing && checked > 0 ? Math.round((count / checked) * 100) : null;
          return (
            <div key={k} className="flex min-w-0 items-baseline gap-2">
              <span aria-hidden className={cn("mt-1 size-2.5 shrink-0 self-center rounded-sm", k === "unverified" ? "border border-line-strong bg-surface-2" : TONE_BAR[verificationTone[k]])} />
              <dt className="min-w-0 flex-1">
                <span className="font-medium text-ink">{LABEL[k]}</span>
                {NOTE[k] && <span className="ml-1.5 text-12 text-faint">{NOTE[k]}</span>}
              </dt>
              <dd className="shrink-0 tabular-nums text-ink-2">
                {count.toLocaleString()}
                {pct !== null && <span className="ml-1.5 text-12 text-faint">{pct}%</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
