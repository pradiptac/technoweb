"use client";

import { Card } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { FaqItem } from "@/types/api";

const MAX = 20;

/**
 * The event the AEO/GEO panel's Apply announces on the form for a
 * `faq_suggest` result, carrying `{ faqs: FaqItem[] }`. Appended as rows,
 * unsaved, the way `AnswerBlocksField` takes `tw:answer-blocks-suggested`.
 */
export const FAQS_SUGGESTED = "tw:faqs-suggested";

/**
 * FAQs for a solution, service or product.
 *
 * These are a polymorphic relation rather than a JSON column, but the editing
 * experience is the same repeater as everything else, and the API replaces the
 * set on save — so the form still submits one hidden JSON value and does not
 * have to track which rows are new, edited or deleted.
 *
 * Order is the order of the rows; the API stamps sort_order from the index.
 */
export function FaqField({
  defaultValue, error,
}: {
  defaultValue: FaqItem[];
  error?: string;
}) {
  const [rows, setRows] = useState<FaqItem[]>(
    defaultValue.length ? defaultValue : [{ question: "", answer: "" }],
  );
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = hidden.current?.closest("form");
    if (!form) return;

    const onSuggested = (e: Event) => {
      const faqs = (e as CustomEvent<{ faqs?: FaqItem[] }>).detail?.faqs;
      if (!Array.isArray(faqs) || faqs.length === 0) return;

      setRows((r) => {
        // The one blank starter row is replaced rather than kept above them.
        const kept = r.filter((row) => row.question.trim() || row.answer.trim());
        const fresh = faqs
          .filter((f) => f && typeof f.question === "string" && typeof f.answer === "string" && f.question.trim() && f.answer.trim())
          .map((f) => ({ question: f.question, answer: f.answer }));
        return [...kept, ...fresh].slice(0, MAX);
      });
    };

    form.addEventListener(FAQS_SUGGESTED, onSuggested);
    return () => form.removeEventListener(FAQS_SUGGESTED, onSuggested);
  }, []);

  const update = (i: number, key: keyof FaqItem, v: string) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [key]: v } : row)));

  const complete = rows
    .map((r) => ({ question: r.question.trim(), answer: r.answer.trim() }))
    .filter((r) => r.question && r.answer);

  return (
    <Card as="section" interactive={false} padding="md" className="mt-2">
      <span className="block text-14-5 font-semibold">FAQs</span>
      <p className="mt-0.5 mb-4 text-13 text-muted">
        Shown on the page and emitted as FAQPage structured data, so these can
        appear directly in search results. Answer the question actually asked.
      </p>

      <input ref={hidden} type="hidden" name="faqs" value={JSON.stringify(complete)} />

      <ul className="grid gap-4">
        {rows.map((row, i) => (
          <li key={i} className="rounded border border-line-strong p-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-12 font-semibold uppercase tracking-[.04em] text-muted">
                Question {i + 1}
              </span>
              <button
                type="button"
                onClick={() => setRows((r) => (r.length === 1 ? [{ question: "", answer: "" }] : r.filter((_, n) => n !== i)))}
                className="text-12-5 font-semibold text-muted hover:text-ink"
              >
                Remove
              </button>
            </div>

            <Input
              aria-label={`FAQ ${i + 1} question`}
              placeholder="Can you work around our production hours?"
              value={row.question}
              onChange={(e) => update(i, "question", e.target.value)}
              className="mb-2"
            />
            <Textarea
              aria-label={`FAQ ${i + 1} answer`}
              placeholder="Yes. Cutovers are planned for evenings or weekends, with a rollback point at every stage."
              rows={3}
              value={row.answer}
              onChange={(e) => update(i, "answer", e.target.value)}
            />
          </li>
        ))}
      </ul>

      {rows.length < MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3.5"
          onClick={() => setRows((r) => [...r, { question: "", answer: "" }])}
        >
          Add question
        </Button>
      )}

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </Card>
  );
}
