"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { FaqItem } from "@/types/api";

const MAX = 20;

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

  const update = (i: number, key: keyof FaqItem, v: string) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, [key]: v } : row)));

  const complete = rows
    .map((r) => ({ question: r.question.trim(), answer: r.answer.trim() }))
    .filter((r) => r.question && r.answer);

  return (
    <section className="mt-2 rounded-lg border border-line-strong bg-white p-5">
      <span className="block text-[14.5px] font-semibold">FAQs</span>
      <p className="mt-0.5 mb-4 text-[13px] text-muted">
        Shown on the page and emitted as FAQPage structured data, so these can
        appear directly in search results. Answer the question actually asked.
      </p>

      <input type="hidden" name="faqs" value={JSON.stringify(complete)} />

      <ul className="grid gap-4">
        {rows.map((row, i) => (
          <li key={i} className="rounded border border-line-strong p-4">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold uppercase tracking-[.04em] text-muted">
                Question {i + 1}
              </span>
              <button
                type="button"
                onClick={() => setRows((r) => (r.length === 1 ? [{ question: "", answer: "" }] : r.filter((_, n) => n !== i)))}
                className="text-[12.5px] font-semibold text-muted hover:text-ink"
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

      {error && <p className="mt-1.5 text-[12.5px] text-err">{error}</p>}
    </section>
  );
}
