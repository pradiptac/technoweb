"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Alert } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { IconLayers } from "@/components/icons-ui";
import type { NewsletterSequence, NewsletterSequenceStep } from "@/types/api";
import { addStepAction, removeStepAction, reorderStepsAction, setStepDelayAction } from "../../actions";

/**
 * The steps: an ordered list, each a campaign row.
 *
 * What is edited here is the *shape* — the order and how many days after the
 * previous step each one goes — and the content is the campaign editor's,
 * one click away, because a step already has the block editor, the health
 * checks and a report by being a campaign. A step's delay is saved as it is
 * changed (a select, so there is no half-typed state to lose), and a step
 * moves with the same arrows every repeater in the console uses.
 *
 * "Day N" is worked out cumulatively for the reader: step three with a
 * delay of 2 after a step with a delay of 3 goes out on day 5, and that is
 * the number somebody planning a series is thinking in.
 */
export function StepsPanel({
  sequence, templates,
}: {
  sequence: NewsletterSequence;
  templates: { id: number; name: string }[];
}) {
  const steps = sequence.steps ?? [];
  const [state, action, adding] = useActionState(addStepAction, {});
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const run = (work: () => Promise<{ ok?: string; error?: string }>) => {
    setMessage(null);
    start(async () => {
      const result = await work();
      setMessage(result.error ? { tone: "err", text: result.error } : { tone: "ok", text: result.ok ?? "Done." });
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = steps.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    run(() => reorderStepsAction(sequence.id, ids));
  };

  // The day each step goes out, cumulatively: the number somebody planning
  // a series is thinking in.
  const days = steps.reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + s.delay_days], []);

  return (
    <div className="grid gap-4">
      {message && (
        <Alert tone={message.tone} title={message.tone === "ok" ? "Done" : "That did not work"}>{message.text}</Alert>
      )}

      {steps.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No steps yet">
          Add the first one below. A sequence with no steps enrols nobody, and it cannot be
          switched on until it has at least one.
        </EmptyState>
      ) : (
        <ol className="grid gap-2">
          {steps.map((step, index) => {
            return (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                count={steps.length}
                day={days[index]}
                disabled={pending}
                onMove={(delta) => move(index, delta)}
                onDelay={(days) => run(() => setStepDelayAction(sequence.id, step.id, days))}
                onRemove={() => run(() => removeStepAction(sequence.id, step.id))}
              />
            );
          })}
        </ol>
      )}

      <section className="border-t border-line pt-3">
        <h2 className="mb-1 text-13 font-semibold">Add a step</h2>
        <p className="measure mb-2 text-12-5 text-muted">
          It goes on the end. Start from a template or blank, then open it to write the message —
          it is a campaign under the hood, with the same editor and the same checks.
        </p>

        {state.error && <Alert tone="err" title="Not added">{state.error}</Alert>}
        {state.ok && <Alert tone="ok" title={state.ok} />}

        <Form action={action} state={state} key={state.ok ?? "add"} className="grid gap-2.5 sm:grid-cols-[1.6fr_1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={sequence.id} />
          <Field label="Subject line" htmlFor="step-subject" variant="float" className="mb-0">
            <Input id="step-subject" name="subject" required maxLength={190} />
          </Field>
          <Field label="Days after the previous step" htmlFor="step-delay" variant="float-static" className="mb-0">
            <Select id="step-delay" name="delay_days" defaultValue={steps.length === 0 ? "0" : "3"}>
              {DELAYS.map((d) => <option key={d} value={d}>{d === 0 ? "Straight away" : `${d} day${d === 1 ? "" : "s"}`}</option>)}
            </Select>
          </Field>
          <Field label="Start from" htmlFor="step-template" variant="float-static" className="mb-0">
            <Select id="step-template" name="template_id" defaultValue="">
              <option value="">Blank</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" size="sm" pending={adding}>{adding ? "Adding…" : "Add step"}</Button>
        </Form>
      </section>
    </div>
  );
}

/** The delays offered: every day to a fortnight, then the usual longer gaps. */
const DELAYS = [0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90];

function StepRow({
  step, index, count, day, disabled, onMove, onDelay, onRemove,
}: {
  step: NewsletterSequenceStep;
  index: number;
  count: number;
  day: number;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onDelay: (days: number) => void;
  onRemove: () => void;
}) {
  const id = `step-${step.id}-delay`;
  const options = DELAYS.includes(step.delay_days) ? DELAYS : [...DELAYS, step.delay_days].sort((a, b) => a - b);

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-ink/30 font-mono text-12 font-semibold text-brand-ink">
        {step.position}
      </span>

      <div className="min-w-0 flex-1">
        <Link href={`/admin/newsletter/campaigns/${step.id}`} className="block truncate text-13 font-medium hover:underline">
          {step.subject}
        </Link>
        <p className="text-12 text-faint">
          Day {day}
          {step.health_score !== null && (
            <span className={step.health_score >= 80 ? "text-ok" : step.health_score >= 60 ? "text-warn" : "text-err"}>
              {" · "}{step.health_score}/100
            </span>
          )}
          {step.sent_count > 0 && <> · sent to {step.sent_count.toLocaleString()}</>}
        </p>
      </div>

      {/*
        `mb-0` on the Field: its wrapper carries an 18px bottom margin for
        stacked forms, and in a flex row that margin is what the row aligns
        to — the control sits 18px above everything beside it.
      */}
      <Field label="Days after the previous" htmlFor={id} variant="float-static" className="mb-0 w-44">
        <Select id={id} value={String(step.delay_days)} disabled={disabled} onChange={(e) => onDelay(Number(e.target.value))}>
          {options.map((d) => <option key={d} value={d}>{d === 0 ? "Straight away" : `${d} day${d === 1 ? "" : "s"}`}</option>)}
        </Select>
      </Field>

      <ButtonLink href={`/admin/newsletter/campaigns/${step.id}`} size="sm" variant="secondary">Edit content</ButtonLink>

      <ReorderButtons
        index={index}
        count={count}
        subject={`step ${step.position}`}
        disabled={disabled}
        onMove={onMove}
        onRemove={onRemove}
      />
    </li>
  );
}
