"use client";

import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { deleteEventAction, duplicateEventAction } from "./actions";

/*
  27px tall with 4px between them: clear of the audit's 24px target floor.
  `relative`, so the sr-only span is positioned inside its own control and
  never against a table's scroll box (a 1px overflow at the page's edge).
*/
const LINK = "relative rounded px-1.5 py-1 text-12-5 font-semibold hover:underline";

/**
 * "Duplicate": a draft copy with no registrations, opened straight away.
 *
 * It is how a series is made — there are no recurring events, each date is
 * its own event — so the copy opens as a draft and its date is changed before
 * anything is published. A one-press form: the action redirects with
 * `?done=` and the toast says what happened. `back` is where a failure
 * returns to.
 */
export function DuplicateEvent({ id, title, back, className }: { id: number; title: string; back: string; className?: string }) {
  return (
    <Form action={duplicateEventAction} className={className}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={cn(LINK, "text-brand-ink")}>
        Duplicate<span className="sr-only"> {title}</span>
      </button>
    </Form>
  );
}

/**
 * Duplicate and Delete for one event, from its row in the list.
 *
 * Two one-press forms with nothing typed into them, so neither carries a
 * state. `back` is the list as it is filtered now, because the API *does*
 * refuse a delete while people are registered, and that refusal has to land
 * on the screen it was pressed on saying "archive it instead" — not on a list
 * somebody then has to filter again.
 */
export function EventRowActions({ id, title, back }: { id: number; title: string; back: string }) {
  return (
    <>
      <DuplicateEvent id={id} title={title} back={back} />

      <Form action={deleteEventAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={back} />
        <button
          type="submit"
          className={cn(LINK, "text-err")}
          onClick={(e) => {
            if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) e.preventDefault();
          }}
        >
          Delete<span className="sr-only"> {title}</span>
        </button>
      </Form>
    </>
  );
}
