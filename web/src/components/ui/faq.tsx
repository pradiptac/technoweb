import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Faq } from "@/types/api";

/**
 * One question that opens: a native <details> rather than a JS accordion,
 * because it is keyboard accessible and findable by in-page search without
 * any client bundle, and it is the one thing on a public page allowed to be
 * collapsed by default. Shared by `FaqList` and by the `question` answer
 * blocks in `components/content/answer-blocks.tsx`, so a page's FAQs and
 * its question blocks are one control rather than two accordions that drift.
 */
export type QuestionItem = { key: string | number; question: string; answer: ReactNode; open?: boolean };

export function QuestionAccordion({ items, className }: { items: QuestionItem[]; className?: string }) {
  if (!items.length) return null;

  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-lg border border-line-strong bg-card", className)}>
      {items.map((it) => (
        <details key={it.key} className="group" open={it.open || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4.5 text-15-5 font-semibold transition-colors hover:bg-brand-50 [&::-webkit-details-marker]:hidden">
            {it.question}
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
              className="ml-auto size-4 shrink-0 text-brand-ink transition-[rotate] duration-(--duration-base) group-open:rotate-45"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <div className="px-5 pb-5 text-14-5 leading-[1.62] text-muted">{it.answer}</div>
        </details>
      ))}
    </div>
  );
}

/**
 * A record's FAQs under one heading.
 *
 * **No `FAQPage` of its own since 2026-09-21.** The API sends the page's
 * `faq_schema` — an `FAQPage` over the FAQs *and* the `question` answer
 * blocks, absent under two entries — and the page renders it through
 * `JsonLd`. This component used to emit one for any list, which would have
 * put two on every page that carries both; the landing page, which the API
 * sends no `faq_schema` for, builds its own beside this under the same
 * two-entry rule (`landing-page-view.tsx`).
 */
export function FaqList({ faqs, heading = "Common questions" }: { faqs: Faq[]; heading?: string }) {
  if (!faqs.length) return null;

  return (
    <>
      <h2 className="display-3">{heading}</h2>
      <QuestionAccordion className="mt-6" items={faqs.map((f) => ({ key: f.id, question: f.question, answer: f.answer }))} />
    </>
  );
}
