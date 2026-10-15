"use client";

import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { duplicateTenderAction } from "./actions";

/*
  27px tall with 4px between them: clear of the audit's 24px target floor.
  `relative`, so the sr-only span is positioned inside its own control and
  never against a table's scroll box (a 1px overflow at the page's edge).
*/
const LINK = "relative rounded px-1.5 py-1 text-12-5 font-semibold hover:underline";

/**
 * "Duplicate": a draft copy, opened straight away.
 *
 * It is how next year's tender is made from last year's — the scope, the
 * fees and the documents carry over, and the number and the dates are the
 * two things that must change. So the copy opens as a draft, with the old
 * number suffixed rather than reused: a tender number is the one field
 * nobody else can guess for you, and two notices answering to one is a
 * question nobody can resolve.
 *
 * A one-press form: the action redirects with `?done=` and the toast says
 * what happened. `back` is where a failure returns to.
 */
export function DuplicateTender({ id, title, back, className }: {
  id: number;
  title: string;
  back: string;
  className?: string;
}) {
  return (
    <Form action={duplicateTenderAction} className={className}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={cn(LINK, "text-brand-ink")}>
        Duplicate<span className="sr-only"> {title}</span>
      </button>
    </Form>
  );
}
