"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EditorField } from "@/components/admin/editor-field";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { cn } from "@/lib/utils";
import type { AnswerBlock, AnswerBlockKind, AnswerBlockKindOption } from "@/types/api";

/**
 * The length the API refuses an answer over (`CmsFieldRules::answerBlocks()`,
 * `docs/aeo-geo-contract.md` §1). Here as well because a field that tells an
 * editor an answer is too long, next to a counter that does not count, has
 * told them to go and count it themselves — the `LIMITS` rule the SEO panel
 * states. Two places, and they have to agree.
 */
export const ANSWER_MAX = 600;

const MAX_BLOCKS = 30;

/**
 * The event the AEO/GEO panel's Apply announces on the form, carrying the
 * blocks a suggestion proposed. The field appends them as rows and nothing
 * is saved until the editor presses Save — the same "put into the form, never
 * into the record" rule the SEO panel's Apply follows. A form event rather
 * than a prop, because the panel and the field are siblings composed by
 * eleven different forms, and threading a callback through each would be
 * eleven chances to wire one wrong.
 */
export const ANSWER_BLOCKS_SUGGESTED = "tw:answer-blocks-suggested";

export type SuggestedAnswerBlock = {
  kind: string;
  question?: string | null;
  answer: string;
  detail?: string | null;
};

type Row = {
  /**
   * A key of the field's own: rows reorder, so an index is not one. Used as
   * the React key and nowhere in the markup — a counter that reaches the DOM
   * hydrates differently on the server, where the module lives across
   * requests, from the client, where it starts at one. The DOM ids below are
   * `useId()` plus the row's index instead.
   */
  uid: number;
  kind: AnswerBlockKind;
  question: string;
  answer: string;
  detail: string;
  status: AnswerBlock["status"];
  /**
   * Whether the rich-text editor for `detail` is mounted. One Summernote per
   * block is a lot of editor for a tab most records never open, so it mounts
   * on demand — with the value held here, so closing it loses nothing.
   */
  showDetail: boolean;
};

let nextUid = 1;

const toRow = (b: Partial<AnswerBlock> & { kind: AnswerBlockKind }): Row => ({
  uid: nextUid++,
  kind: b.kind,
  question: b.question ?? "",
  answer: b.answer ?? "",
  detail: b.detail ?? "",
  status: b.status ?? "published",
  showDetail: Boolean(b.detail),
});

/**
 * Answer blocks — the direct answers a page gives an answer engine, edited
 * as a repeater on the AEO tab of every entity that carries them.
 *
 * The same shape as `FaqField`: the rows are React state, and the form
 * submits one hidden JSON value named `answer_blocks` that the API replaces
 * the set from wholesale, stamping `sort_order` from the array. So the form
 * never tracks which rows are new, edited or deleted, and reordering is
 * moving an entry in an array.
 *
 * `kinds` is `meta.answer_block_kinds` from the entity's admin index — the
 * labels, the section heading each renders under and whether one asks a
 * question all come from the API, and this file never retypes them. With
 * no list (an API that has not learnt the feature yet) the existing rows
 * still render with their raw kind and nothing can be added, which is said
 * on the screen rather than left as an empty select.
 *
 * What is posted: `[{kind, question, answer, detail, status}]`, in order.
 * A row with nothing typed in it is dropped; a row with *something* in it
 * is sent as it is, so a question block with no question comes back as a
 * 422 on the AEO tab rather than being thrown away in silence.
 */
export function AnswerBlocksField({
  defaultValue, kinds, error,
}: {
  defaultValue: AnswerBlock[];
  kinds: AnswerBlockKindOption[];
  error?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => defaultValue.map(toRow));
  const hidden = useRef<HTMLInputElement>(null);
  const base = useId();

  const kindOf = (kind: string) => kinds.find((k) => k.value === kind);
  const fallbackKind = (kinds[0]?.value ?? "definition") as AnswerBlockKind;

  /*
    Suggestions from the assistant arrive on the form as an event (see
    `ANSWER_BLOCKS_SUGGESTED`). A kind the API's list does not know is kept
    as typed rather than dropped — the API validates it on save, and a
    refused row on the tab is better than a block that quietly vanished.
  */
  useEffect(() => {
    const form = hidden.current?.closest("form");
    if (!form) return;

    const onSuggested = (e: Event) => {
      const blocks = (e as CustomEvent<{ blocks?: SuggestedAnswerBlock[] }>).detail?.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0) return;

      setRows((r) => [
        ...r,
        ...blocks
          .filter((b) => b && typeof b.answer === "string" && b.answer.trim())
          .slice(0, Math.max(0, MAX_BLOCKS - r.length))
          .map((b) => toRow({
            kind: (typeof b.kind === "string" && b.kind ? b.kind : fallbackKind) as AnswerBlockKind,
            question: b.question ?? null,
            answer: b.answer,
            detail: b.detail ?? null,
            status: "draft",
          })),
      ]);
    };

    form.addEventListener(ANSWER_BLOCKS_SUGGESTED, onSuggested);
    return () => form.removeEventListener(ANSWER_BLOCKS_SUGGESTED, onSuggested);
  }, [fallbackKind]);

  const update = <K extends keyof Row>(uid: number, key: K, value: Row[K]) =>
    setRows((r) => r.map((row) => (row.uid === uid ? { ...row, [key]: value } : row)));

  const move = (i: number, delta: -1 | 1) =>
    setRows((r) => {
      const j = i + delta;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (uid: number) => setRows((r) => r.filter((row) => row.uid !== uid));

  const add = () => setRows((r) => [...r, toRow({ kind: fallbackKind })]);

  /*
    What is posted. Blank rows are dropped; anything with content is sent as
    typed, including a `question` block missing its question — the API's
    422 lands on this tab through `buildFormTabs`, which is where an editor
    can act on it. `detail` is null rather than "" when empty, so the API's
    "nullable" reads it as absent.
  */
  const posted = rows
    .filter((r) => r.question.trim() || r.answer.trim() || r.detail.trim())
    .map((r) => ({
      kind: r.kind,
      question: r.question.trim() || null,
      answer: r.answer.trim(),
      detail: r.detail.trim() || null,
      status: r.status,
    }));

  return (
    <Card as="section" interactive={false} padding="md" className="mt-2">
      <span className="block text-14-5 font-semibold">Answer blocks</span>
      <p className="measure mt-0.5 mb-4 text-13 text-muted">
        Short, direct answers an answer engine can quote — what it is, who it
        is for, why it is needed, the key facts. Each is drawn on the page under
        the heading its kind names. The answer is the quotable part; the detail
        is the explanation under it.
      </p>

      <input ref={hidden} type="hidden" name="answer_blocks" value={JSON.stringify(posted)} />

      {rows.length === 0 && (
        <p className="mb-3 text-13 text-muted">No answer blocks yet.</p>
      )}

      <ul className="grid gap-4">
        {rows.map((row, i) => {
          const kind = kindOf(row.kind);
          const asks = kind?.asks_question ?? false;
          const id = (f: string) => `${base}-block-${i}-${f}`;

          return (
            <li key={row.uid} className="rounded border border-line-strong p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-12 font-semibold uppercase tracking-[.04em] text-muted">
                  Block {i + 1}
                  {kind && <span className="ml-1.5 normal-case tracking-normal text-faint">· {kind.heading}</span>}
                </span>
                <ReorderButtons
                  index={i}
                  count={rows.length}
                  subject={`block ${i + 1}`}
                  onMove={(delta) => move(i, delta)}
                  onRemove={() => remove(row.uid)}
                />
              </div>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Kind" htmlFor={id("kind")} variant="float-static"
                  hint={kind ? `Drawn under “${kind.heading}”.` : "The API sent no list of kinds; this one is kept as stored."}>
                  <Select
                    id={id("kind")}
                    value={row.kind}
                    onChange={(e) => update(row.uid, "kind", e.target.value as AnswerBlockKind)}
                  >
                    {!kind && <option value={row.kind}>{row.kind}</option>}
                    {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </Select>
                </Field>

                <Field label="Status" htmlFor={id("status")} variant="float-static"
                  hint="A draft is kept but not shown on the page.">
                  <Select
                    id={id("status")}
                    value={row.status}
                    onChange={(e) => update(row.uid, "status", e.target.value as AnswerBlock["status"])}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </Select>
                </Field>
              </div>

              <Field
                label={asks ? "Question" : "Question (optional)"}
                htmlFor={id("question")}
                hint={asks
                  ? "Required for this kind: the question this block answers, as somebody would ask it."
                  : "Optional. A question makes this block a heading of its own on the page."}
              >
                <Input
                  id={id("question")}
                  value={row.question}
                  onChange={(e) => update(row.uid, "question", e.target.value)}
                  placeholder={asks ? "How long does a network cutover take?" : ""}
                  aria-required={asks || undefined}
                />
              </Field>

              <Field
                label="Answer"
                htmlFor={id("answer")}
                hint={<AnswerCounter value={row.answer} />}
              >
                <Textarea
                  id={id("answer")}
                  rows={3}
                  value={row.answer}
                  onChange={(e) => update(row.uid, "answer", e.target.value)}
                  placeholder="One direct answer, in plain words, that stands on its own."
                  aria-invalid={[...row.answer].length > ANSWER_MAX || undefined}
                />
              </Field>

              {row.showDetail ? (
                <EditorField
                  name={`_answer_block_detail_${i}`}
                  label="Detail"
                  hint="The supporting explanation, drawn under the answer. Optional."
                  defaultValue={row.detail}
                  onChange={(html) => update(row.uid, "detail", html)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => update(row.uid, "showDetail", true)}
                  className="mb-1 text-12-5 font-semibold text-brand-ink hover:underline"
                >
                  Add supporting detail
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {kinds.length === 0 ? (
        <p className="mt-3.5 text-12-5 text-warn">
          The API sent no answer-block kinds, so nothing can be added here yet.
        </p>
      ) : rows.length < MAX_BLOCKS && (
        <Button type="button" variant="secondary" size="sm" className="mt-3.5" onClick={add}>
          Add a block
        </Button>
      )}

      {error && <p className="mt-1.5 text-12-5 text-err">{error}</p>}
    </Card>
  );
}

/** `n / 600`, red past the limit — what the API will refuse, counted here. */
function AnswerCounter({ value }: { value: string }) {
  const n = [...value].length;
  const over = n > ANSWER_MAX;

  return (
    <span className={cn("tabular-nums", over ? "font-semibold text-err" : "text-faint")}>
      {n} / {ANSWER_MAX} characters
      {over && " — the API refuses an answer over 600"}
    </span>
  );
}
