import { cn } from "@/lib/utils";
import { IconCheck } from "@/components/icons-ui";

export type StepState = "done" | "current" | "waiting" | "upcoming";
export type Step = { label: string; state: StepState; note?: string };

/**
 * Where something is in its journey — a ticket from received to closed, an
 * order from placed to delivered (2026-10-05, the customer portal).
 *
 * Server-rendered, no JavaScript. Across the card from `sm`, where a row of
 * four or five fits; down the card on a phone, where the same row would
 * squeeze each label to a word per line — the stepper changes direction
 * rather than shrinking. Each step says its state in words for a screen
 * reader (`sr-only`), so the colour and the tick are never the only channel.
 *
 * `waiting` is "current, but the ball is in your court" — a ticket waiting on
 * the customer's reply — and takes the warn tone, because that is the one
 * state where the reader is the person holding things up.
 */
const WORDS: Record<StepState, string> = { done: "done", current: "now", waiting: "waiting for you", upcoming: "to come" };

export function Stepper({ steps, label, className }: { steps: Step[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn("grid gap-0 sm:flex sm:items-start", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const reached = s.state !== "upcoming";
        const nextReached = !last && steps[i + 1].state !== "upcoming";
        return (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center">
            {/* The connector to the next step: down on a phone, across from `sm`. */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-0.5 sm:top-[13px] sm:bottom-auto sm:left-[calc(50%+18px)] sm:h-0.5 sm:w-[calc(100%-36px)]",
                  nextReached ? "bg-brand-500" : "bg-line-strong",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative grid size-7 shrink-0 place-items-center rounded-full border-2 text-12 font-semibold",
                s.state === "done" && "border-brand-600 bg-brand-600 text-brand-on",
                s.state === "current" && "border-brand-600 bg-card text-brand-ink ring-4 ring-brand-500/15",
                s.state === "waiting" && "border-warn bg-warn-soft text-warn ring-4 ring-warn/15",
                s.state === "upcoming" && "border-line-strong bg-card text-muted",
              )}
            >
              {s.state === "done" ? <IconCheck className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 pt-0.5 sm:pt-0">
              <span className={cn("block text-13 leading-snug", reached ? "font-semibold text-ink" : "text-muted")}>
                {s.label}
                <span className="sr-only"> — {WORDS[s.state]}</span>
              </span>
              {s.note && <span className="mt-0.5 block text-12 text-muted">{s.note}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
