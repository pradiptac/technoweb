"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveSurveyAction, type SurveyResult } from "./actions";
import type { TicketSurvey } from "@/lib/ticket-survey";

/**
 * Which token-coloured fill each answer takes when chosen. Red to green, the
 * scale the email's buttons draw, from the same status tokens the rest of the
 * site uses — never a hex here. White text sits on every one of them at
 * 4.5:1 or better, in both schemes (`--color-*-fill`).
 */
const FILL: Record<number, string> = {
  1: "bg-err-fill",
  2: "bg-err-fill",
  3: "bg-warn-fill",
  4: "bg-ok-fill",
  5: "bg-ok-fill",
};

/**
 * What to ask once a rating is in: a different question for a low score, a
 * middling one and a high one. The label is the field's, so the wording is
 * the only thing that changes.
 */
function feedbackAsk(rating: number): { heading: string; label: string } {
  if (rating <= 2) {
    return {
      heading: "We are sorry we did not get this right.",
      label: "What went wrong, and what could we have done better?",
    };
  }
  if (rating === 3) {
    return {
      heading: "Thank you — we would like to do better.",
      label: "What would have made this a better experience?",
    };
  }

  return {
    heading: "Glad to hear it — thank you.",
    label: "What did we do well? Anything we should keep doing?",
  };
}

/**
 * Five ratings, then feedback worded for the score.
 *
 * **A press on a rating records it at once**, and so does arriving from an
 * emailed button: the rating in the link is recorded when this page runs in a
 * browser (`useEffect`), not by anything that merely fetches the link — a
 * mail scanner reading the address never executes this. Every save carries the
 * comment typed so far, so changing the rating afterwards keeps the words.
 *
 * The feedback is optional and sent with its own button; the answer is already
 * safe without it.
 */
export function SurveyForm({
  token,
  survey,
  preset,
}: {
  token: string;
  survey: TicketSurvey;
  preset: number | null;
}) {
  const [saved, setSaved] = useState<TicketSurvey>(survey);
  const [rating, setRating] = useState<number | null>(preset ?? survey.rating);
  const [comment, setComment] = useState(survey.comment ?? "");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const arrived = useRef(false);

  function apply(result: SurveyResult, fromFeedback = false) {
    if (result.saved) {
      setSaved(result.saved);
      if (fromFeedback) setFeedbackSent(true);
    } else if (result.error) {
      setError(result.error);
    }
  }

  function save(next: number, words: string, fromFeedback = false) {
    setError(null);
    start(async () => apply(await saveSurveyAction(token, next, words), fromFeedback));
  }

  // Arriving from an emailed button: record the rating it carried, once,
  // unless it is what is already on file.
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;

    // State is set when the save answers, never synchronously in the effect.
    if (preset !== null && preset !== survey.rating) {
      void saveSurveyAction(token, preset, survey.comment ?? "").then((result) => apply(result));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recorded = saved.rating;
  const ask = recorded !== null ? feedbackAsk(recorded) : null;

  return (
    <div>
      {error && <Alert tone="err" title="That did not work">{error}</Alert>}

      <fieldset>
        <legend className="text-16 font-semibold">
          How would you rate your overall satisfaction with the resolution you received from our support team?
        </legend>

        <div className="mt-4 flex flex-wrap gap-3">
          {saved.ratings.map((r) => {
            const on = rating === r.value;

            return (
              <label
                key={r.value}
                className={cn(
                  "cursor-pointer rounded-md border px-5 py-3 text-15 font-semibold transition-colors duration-(--duration-base)",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  on ? `${FILL[r.value]} border-transparent text-white` : "border-line-strong bg-card text-ink hover:border-brand-600",
                )}
              >
                <input
                  type="radio"
                  name="rating"
                  value={r.value}
                  checked={on}
                  disabled={pending && !on}
                  onChange={() => {
                    setRating(r.value);
                    // The heading below changes with the score; the "feedback
                    // saved" note belongs to the answer it was sent with.
                    setFeedbackSent(false);
                    save(r.value, comment);
                  }}
                  className="sr-only"
                />
                {r.label}
              </label>
            );
          })}
        </div>

        <p role="status" aria-live="polite" className="mt-3 min-h-6 text-14 text-muted">
          {pending ? "Saving…" : recorded !== null ? <>Saved — you rated ticket {saved.reference} <strong className="text-ink">{saved.rating_label}</strong>.</> : null}
        </p>
      </fieldset>

      {ask && recorded !== null && (
        <div className="mt-4 rounded-lg border border-line-strong bg-card p-5">
          <p className="mb-3 text-16 font-semibold">{ask.heading}</p>

          {feedbackSent && (
            <Alert tone="ok" title="Thank you — your feedback is saved" dismissible={false}>
              Anything else you remember, you can add below and send again.
            </Alert>
          )}

          <div className="mt-3">
            <Field label={ask.label} htmlFor="comment">
              <Textarea
                id="comment"
                name="comment"
                rows={4}
                maxLength={saved.comment_max}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-2 flex flex-wrap gap-3">
            <Button type="button" pending={pending} onClick={() => save(recorded, comment, true)}>
              {pending ? "Saving…" : "Send feedback"}
            </Button>
            <ButtonLink href="/" variant="ghost">No thanks — back to the website</ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
