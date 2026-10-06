"use client";

import { useCallback, useEffect, useImperativeHandle, useState, useTransition, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  decideSeoSuggestionAction,
  loadSeoAiAction,
  runSeoAiAction,
  seoAiContextAction,
} from "@/components/admin/ai-seo-actions";
import type { FaqItem, SeoAiActionKey, SeoAiMeta, SeoSuggestion } from "@/types/api";
import type { SeoAiRunExtra } from "@/lib/admin/seo";
import type { SuggestedAnswerBlock } from "@/components/admin/answer-blocks-field";

/**
 * The actions the AEO/GEO panel draws, and the SEO panel therefore does not
 * (`docs/aeo-geo-contract.md` §6). The *keys* are the contract; whether each
 * exists, and what it is called, comes from `meta.actions` — an action the
 * API has not learnt is simply not in the list and so not drawn. This set
 * decides which of the two panels a known action belongs to, nothing more.
 */
export const AEO_ACTIONS: readonly SeoAiActionKey[] = [
  "aeo_analyze", "questions", "answer_blocks", "improve_answer", "faq_suggest",
  "geo_analyze", "entity_links", "product_qa",
];

/**
 * What an editor can put straight into the form, and what they cannot.
 *
 * The four SEO actions that produce values this panel owns fields for get an
 * Apply, and so do the three AEO actions that produce rows for the
 * repeaters — `answer_blocks` and `product_qa` land in `AnswerBlocksField`,
 * `faq_suggest` in `FaqField`, through a form event, as drafts, unsaved. The
 * rest produce things that live elsewhere — a rewritten body on the Content
 * tab, anchor text inside the copy, an analysis to read — and offering an
 * Apply that quietly did nothing to them would be worse than not offering
 * one. Those get Copy, and a line saying where it goes.
 */
const APPLIES: Record<SeoAiActionKey, boolean> = {
  generate: true,
  analyze: true,
  schema: true,
  keywords: true,
  improve: false,
  faq: false,
  internal_links: false,
  aeo_analyze: false,
  questions: false,
  answer_blocks: true,
  improve_answer: false,
  faq_suggest: true,
  geo_analyze: false,
  entity_links: false,
  product_qa: true,
};

/** What the editor is meant to do with the ones this panel cannot apply. */
const WHERE: Partial<Record<SeoAiActionKey, string>> = {
  improve: "Paste into the body on the Content tab, then read it before saving.",
  faq: "Add these on the FAQs tab. Nothing is added for you.",
  internal_links: "Link these from the body copy where they fit the sentence.",
  aeo_analyze: "Each gap names a block worth adding below. Nothing is changed for you.",
  geo_analyze: "Each gap names a relationship or a signal to add. Nothing is changed for you.",
  questions: "Turn the ones worth answering into question blocks or FAQs below.",
  improve_answer: "Paste the answer into the block it was written for, then read it before saving.",
  entity_links: "Tick these on the Related tab, or link them from the body copy.",
  answer_blocks: "Added as draft blocks below. A [MISSING: …] marks a fact the model was not given — fill it in or delete the block.",
  product_qa: "Added as draft blocks below. A [MISSING: …] marks a fact the model was not given — fill it in or delete the block.",
  faq_suggest: "Added as FAQ rows below. Read each answer before saving.",
};

export type SeoAiPatch = {
  title?: string;
  description?: string;
  focus_keyword?: string;
  secondary_keywords?: string[];
  schema_type?: string;
  /** Rows for the answer-block repeater, from `answer_blocks` / `product_qa`. */
  blocks?: SuggestedAnswerBlock[];
  /** Rows for the FAQ repeater, from `faq_suggest`. */
  faqs?: FaqItem[];
};

/**
 * The AI assistant, inside the SEO panel.
 *
 * **Nothing here saves anything.** Applying a suggestion writes it into the
 * form fields the editor is already looking at; the record changes when they
 * press Save, through the same endpoint, validation and sanitising a typed
 * value goes through. That is what makes "AI must never publish" a property of
 * the design rather than a rule somebody has to keep.
 *
 * It renders **nothing at all** when the feature is switched off, so an install
 * that never turns it on has exactly the console it has today.
 */
/**
 * What another component on the same form may ask of the panel: run one
 * action. The AEO tab's score cards use it for "Suggest improvements", so
 * the run, the cap counter and the history stay in this one place rather
 * than a second copy of `run` beside them.
 */
export type AiSeoPanelHandle = {
  run: (action: SeoAiActionKey, extra?: SeoAiRunExtra, options?: { quiet?: boolean }) => void;
};

export function AiSeoPanel({
  type, id, onApply, current, scope = "seo", blocks = [], ref, onReady, onHistory, onSuggestion,
}: {
  type: string;
  id: number;
  onApply: (patch: SeoAiPatch) => void;
  /**
   * Which of the two panels this is: the SEO tab's draws every action the
   * API offers except `AEO_ACTIONS`, the AEO tab's draws only those. One
   * component in two places rather than two, so the cap, the history and
   * the context dialog cannot disagree.
   */
  scope?: "seo" | "aeo";
  /**
   * What the form holds right now, so a suggestion can be shown *against*
   * it — the current title struck through above the proposed one — rather
   * than as a value with nothing to compare to. Read at render, never
   * stored: the fields are the SEO panel's state and this only looks.
   */
  current?: Partial<Record<"title" | "description" | "focus_keyword", string>>;
  /**
   * The record's *saved* answer blocks, for `improve_answer` — the one
   * action about a single block rather than the record, so it needs telling
   * which. Only a block with an id can be named (the API rewrites what is
   * stored, not what is typed), so a row added and not yet saved is not
   * offered; with none the button is drawn disabled and says why.
   */
  blocks?: { id: number; label: string }[];
  ref?: Ref<AiSeoPanelHandle>;
  /** Told once the meta has loaded whether the assistant can be pressed at all (on, with a key). */
  onReady?: (available: boolean) => void;
  /** Told the record's stored suggestions once they have loaded, newest first. */
  onHistory?: (suggestions: SeoSuggestion[]) => void;
  /** Told each suggestion as it arrives, whichever button asked for it. */
  onSuggestion?: (suggestion: SeoSuggestion) => void;
}) {
  const [meta, setMeta] = useState<SeoAiMeta | null>(null);
  const [suggestions, setSuggestions] = useState<SeoSuggestion[]>([]);
  const [open, setOpen] = useState<SeoSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<SeoAiActionKey | null>(null);
  const [context, setContext] = useState<{ context: string; approximate_tokens: number } | null>(null);
  const [blockId, setBlockId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  // The picker's value: what was chosen, or the first saved block — never a
  // stale id for a block that has since been removed.
  const chosenBlock = blocks.find((b) => b.id === blockId)?.id ?? blocks[0]?.id ?? null;
  const toast = useToast();

  /*
    Loaded once, on mount.

    It is one request per edit form, and it buys the two things the panel
    cannot draw without: whether the feature is on at all, and this record's
    history. Fetching in an effect is not the pattern
    `react-hooks/set-state-in-effect` refuses — that is seeding state from a
    prop, which can be computed during render. A round trip cannot.
  */
  useEffect(() => {
    let live = true;

    loadSeoAiAction(type, id).then((res) => {
      if (!live) return;
      if (res.ok) {
        setMeta(res.data.meta);
        setSuggestions(res.data.suggestions);
        onReady?.(res.data.meta.enabled && res.data.meta.configured);
        onHistory?.(res.data.suggestions);
      } else {
        onReady?.(false);
      }
    });

    return () => { live = false; };
    // The three callbacks are read at load time only; keying on them would
    // refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  const run = useCallback((action: SeoAiActionKey, extra: SeoAiRunExtra = {}, options: { quiet?: boolean } = {}) => {
    setError(null);
    setRunning(action);

    startTransition(async () => {
      const res = await runSeoAiAction(action, type, id, extra);
      setRunning(null);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setSuggestions((prev) => [res.data, ...prev]);
      onSuggestion?.(res.data);
      // A quiet run is one whose caller draws the result itself (the score
      // cards' inline suggestions); opening the dialog over it would show
      // the same words twice.
      if (!options.quiet) setOpen(res.data);
      // The counter moved, so the "N left today" line beside the buttons has
      // to as well — a cap that only updates on a reload is one somebody
      // walks into.
      setMeta((m) => (m ? { ...m, today: { ...m.today, runs: m.today.runs + 1,
        remaining: m.today.remaining === null ? null : Math.max(0, m.today.remaining - 1) } } : m));
    });
  }, [type, id, onSuggestion]);

  useImperativeHandle(ref, () => ({ run }), [run]);

  const decide = useCallback((suggestion: SeoSuggestion, status: "applied" | "rejected") => {
    startTransition(async () => {
      const res = await decideSeoSuggestionAction(suggestion.id, status);

      if (res.ok) {
        setSuggestions((prev) => prev.map((s) => (s.id === res.data.id ? res.data : s)));
      }
    });
  }, []);

  const apply = useCallback((suggestion: SeoSuggestion) => {
    const r = suggestion.result as Record<string, unknown>;
    const str = (k: string) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : undefined);

    const patch: SeoAiPatch = {
      title: str("title"),
      description: str("description"),
      focus_keyword: str("focus_keyword"),
      schema_type: str("schema_type"),
      secondary_keywords: Array.isArray(r.secondary_keywords)
        ? (r.secondary_keywords as string[])
        : undefined,
      /*
        The repeater rows, only from the actions that produce them. `faqs`
        is on the `faq` action's result too, and `faq` is not applied — its
        rows would land in a repeater on a form that may not have one.
      */
      blocks: (suggestion.action === "answer_blocks" || suggestion.action === "product_qa") && Array.isArray(r.blocks)
        ? (r.blocks as SuggestedAnswerBlock[])
        : undefined,
      faqs: suggestion.action === "faq_suggest" && Array.isArray(r.faqs)
        ? (r.faqs as FaqItem[])
        : undefined,
    };

    onApply(patch);
    decide(suggestion, "applied");
    setOpen(null);
    toast({
      tone: "ok",
      title: patch.blocks || patch.faqs ? "Added to the form as drafts" : "Put into the form",
      body: "Nothing is saved yet — read it, change what you want, then press Save.",
    });
  }, [onApply, decide, toast]);

  const copy = useCallback((suggestion: SeoSuggestion) => {
    navigator.clipboard?.writeText(asText(suggestion)).then(
      () => toast({ tone: "ok", title: "Copied" }),
      () => toast({ tone: "err", title: "Could not copy", body: "Select the text and copy it by hand." }),
    );
  }, [toast]);

  const showContext = useCallback(() => {
    startTransition(async () => {
      const res = await seoAiContextAction(type, id);
      if (res.ok) setContext(res.data);
      else setError(res.error);
    });
  }, [type, id]);

  // Switched off, or still loading. Either way there is nothing to show, and a
  // spinner for a feature most installs do not use would be noise.
  if (!meta?.enabled) return null;

  const mine = (action: SeoAiActionKey) => AEO_ACTIONS.includes(action) === (scope === "aeo");
  const actions = meta.actions.filter((a) => mine(a.value));
  const history = suggestions.filter((s) => mine(s.action));

  // The AEO panel with an API that offers none of its actions yet: nothing
  // to press, so nothing drawn — the SEO tab's panel is where the feature
  // still lives, and an empty box saying "AI assistant" over no buttons
  // would read as broken.
  if (scope === "aeo" && actions.length === 0 && history.length === 0) return null;

  return (
    <section className="mt-1 mb-[18px] rounded-lg border border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-14 font-semibold">AI assistant</h3>

        {/*
          The cap, before it bites.

          The chat overview exists partly because a daily ceiling whose first
          symptom is people being turned away is a ceiling nobody can plan
          around. `remaining` is null when uncapped, which reads as nothing
          rather than as zero.
        */}
        <p className="text-12-5 text-muted">
          {meta.today.remaining === null
            ? `${meta.today.runs} used today`
            : `${meta.today.remaining} of ${meta.today.cap} left today`}
        </p>
      </div>

      <p className="measure mt-1 text-12-5 text-muted">
        Suggestions only. Nothing is written to this record until you press Save.
      </p>

      {!meta.configured && (
        <p className="mt-3 text-12-5 text-warn">
          No OpenRouter key is configured, so these will refuse. Settings → API keys.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.map((a) => a.value === "improve_answer" ? (
          // The one action about a block rather than the record: the button
          // and the picker for which block, together, so the choice is
          // beside the press. Disabled with a reason when nothing is saved
          // yet — a 422 from the API would say the same a round trip later.
          <span key={a.value} className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              title={blocks.length ? a.description : "Save an answer block first, then choose which one to improve."}
              disabled={running !== null || meta.today.reached || chosenBlock === null}
              onClick={() => chosenBlock !== null && run(a.value, { block_id: chosenBlock })}
            >
              {running === a.value ? "Thinking…" : a.label}
            </Button>
            {blocks.length > 0 && (
              <Select
                aria-label="Which answer block to improve"
                className="!h-8 !py-0 !text-12-5"
                value={chosenBlock ?? ""}
                onChange={(e) => setBlockId(Number(e.target.value))}
                disabled={running !== null}
              >
                {blocks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </Select>
            )}
          </span>
        ) : (
          <Button
            key={a.value}
            type="button"
            variant="secondary"
            size="sm"
            title={a.description}
            disabled={running !== null || meta.today.reached}
            onClick={() => run(a.value)}
          >
            {running === a.value ? "Thinking…" : a.label}
          </Button>
        ))}
      </div>

      {meta.today.reached && (
        <p className="mt-2 text-12-5 text-warn">
          The daily limit has been reached. It resets at midnight.
        </p>
      )}

      {error && <p className="mt-2 text-12-5 text-err">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12-5">
        {/* 24px tall: a text link this small beside the history row fails the audit's tap-target check without the box, the `Alert` dismiss button's rule. */}
        <button type="button" onClick={showContext} className="inline-flex min-h-6 items-center font-semibold text-brand-ink hover:underline">
          What the AI is told
        </button>

        {history.length > 0 && (
          <span className="text-muted">
            {history.length} previous suggestion{history.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {history.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {history.slice(0, 5).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(s)}
                className="flex w-full items-center justify-between gap-3 rounded border border-line px-3 py-2 text-left text-12-5 hover:border-brand-300"
              >
                <span className="min-w-0 truncate">{s.action_label}</span>
                <span className="shrink-0 text-muted">{s.status_label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={open.action_label}
          description={WHERE[open.action] ?? "Read it, change what you want, then apply."}
          footer={
            <div className="flex flex-wrap gap-2">
              {APPLIES[open.action] && (
                <Button type="button" size="sm" onClick={() => apply(open)}>Apply to the form</Button>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(open)}>Copy</Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { decide(open, "rejected"); setOpen(null); }}
              >
                Reject
              </Button>
            </div>
          }
        >
          <Suggestion suggestion={open} current={current} />
        </Modal>
      )}

      {context && (
        <Modal
          open
          onClose={() => setContext(null)}
          title="What the AI is told"
          description={`About ${context.approximate_tokens} tokens. Page copy sits between the fence markers and is treated as material, never as instructions.`}
        >
          <pre className="max-h-[24rem] overflow-auto rounded border border-line bg-surface-2 p-3 text-12 whitespace-pre-wrap">
            {context.context}
          </pre>
        </Modal>
      )}
    </section>
  );
}

/** The stored result, rendered by shape — and, for the fields the form holds, against what it holds. */
function Suggestion({ suggestion, current }: { suggestion: SeoSuggestion; current?: Partial<Record<string, string>> }) {
  const r = suggestion.result as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const list = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((v) => typeof v === "string") as string[] : []);
  const was = (k: string) => {
    const now = current?.[k]?.trim();
    return now && now !== text(k).trim() && suggestion.status === "pending" ? now : null;
  };

  return (
    <div className="grid gap-3 text-13-5">
      {(["title", "description", "focus_keyword", "intent", "summary", "reason", "schema_type", "answer"] as const).map((k) =>
        text(k) ? (
          <div key={k}>
            <p className="text-12 font-semibold uppercase tracking-[.04em] text-faint">{label(k)}</p>
            {was(k) && (
              /* The value in the form today, struck: what Apply would replace. */
              <p className="mt-0.5 text-muted line-through decoration-err/60" aria-label={`Currently: ${was(k)}`}>{was(k)}</p>
            )}
            <p className="mt-0.5">{text(k)}</p>
          </div>
        ) : null,
      )}

      {(["secondary_keywords", "keywords", "strengths", "weaknesses", "gaps", "suggestions", "notes"] as const).map((k) =>
        list(k).length > 0 ? (
          <div key={k}>
            <p className="text-12 font-semibold uppercase tracking-[.04em] text-faint">{label(k)}</p>
            <ul className="mt-0.5 grid gap-1">
              {list(k).map((v, i) => <li key={i} className="before:mr-1.5 before:content-['—']">{v}</li>)}
            </ul>
          </div>
        ) : null,
      )}

      {Array.isArray(r.faqs) && (
        <div className="grid gap-2">
          {(r.faqs as { question: string; answer: string }[]).map((f, i) => (
            <div key={i} className="rounded border border-line p-2.5">
              <p className="font-semibold">{f.question}</p>
              <p className="mt-1 text-muted">{f.answer}</p>
            </div>
          ))}
        </div>
      )}

      {/*
        `internal_links` sends `{title, path, anchor, reason}`; `entity_links`
        sends `{n, relation, reason}` — an index into the numbered list the
        model was shown, and the relation it proposes. Both are lists of
        real pages chosen rather than composed, and both render here.
      */}
      {Array.isArray(r.links) && (
        <ul className="grid gap-2">
          {(r.links as { title?: string; path?: string; anchor?: string; reason?: string; n?: number; relation?: string }[]).map((l, i) => (
            <li key={i} className="rounded border border-line p-2.5">
              <p className="font-semibold">
                {l.title ?? (l.n !== undefined ? `Page ${l.n} of the list` : "A page")}
                {l.relation && <span className="ml-1.5 font-normal text-muted">as {l.relation.replace(/_/g, " ")}</span>}
              </p>
              {l.path && <p className="font-mono text-12 text-muted">{l.path}</p>}
              {l.anchor && <p className="mt-1">Anchor: “{l.anchor}”</p>}
              {l.reason && <p className="text-muted">{l.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* `questions`: what people ask, and why (the intent). */}
      {Array.isArray(r.questions) && (
        <ol className="grid gap-1.5 pl-5 list-decimal">
          {(r.questions as { question: string; intent?: string }[]).map((q, i) => (
            <li key={i}>
              <span className="font-semibold">{q.question}</span>
              {q.intent && <span className="ml-1.5 text-12 text-muted">({q.intent})</span>}
            </li>
          ))}
        </ol>
      )}

      {/*
        `answer_blocks` / `product_qa`: the rows Apply will add. A
        `[MISSING: …]` inside an answer is kept exactly as the model wrote
        it — that is the model saying it was not given the fact — and is
        the thing an editor is meant to see before pressing Apply.
      */}
      {Array.isArray(r.blocks) && (
        <div className="grid gap-2">
          {(r.blocks as { kind?: string; question?: string | null; answer?: string; detail?: string | null }[]).map((b, i) => (
            <div key={i} className="rounded border border-line p-2.5">
              <p className="text-11 font-semibold uppercase tracking-[.04em] text-faint">{(b.kind ?? "block").replace(/_/g, " ")}</p>
              {b.question && <p className="mt-0.5 font-semibold">{b.question}</p>}
              <p className="mt-1 whitespace-pre-wrap">{b.answer}</p>
              {b.detail && <p className="mt-1 text-12-5 text-muted whitespace-pre-wrap">{b.detail.replace(/<[^>]+>/g, " ").trim()}</p>}
            </div>
          ))}
        </div>
      )}

      {/* `improve_answer`: the supporting detail beside the rewritten answer above. */}
      {text("detail") && (
        <div>
          <p className="text-12 font-semibold uppercase tracking-[.04em] text-faint">Detail</p>
          <pre className="mt-0.5 max-h-[18rem] overflow-auto rounded border border-line bg-surface-2 p-3 text-12-5 whitespace-pre-wrap">
            {text("detail")}
          </pre>
        </div>
      )}

      {text("suggested") && (
        <div>
          <p className="text-12 font-semibold uppercase tracking-[.04em] text-faint">Suggested copy</p>
          <pre className="mt-0.5 max-h-[18rem] overflow-auto rounded border border-line bg-surface-2 p-3 text-12-5 whitespace-pre-wrap">
            {text("suggested")}
          </pre>
        </div>
      )}

      <p className="text-12 text-faint">
        {suggestion.model ?? "unknown model"} · {suggestion.tokens} tokens
      </p>
    </div>
  );
}

function label(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Everything in a suggestion as plain text, for the clipboard. */
function asText(suggestion: SeoSuggestion): string {
  const r = suggestion.result as Record<string, unknown>;

  return Object.entries(r)
    .map(([k, v]) => {
      if (typeof v === "string") return v ? `${label(k)}: ${v}` : "";
      if (Array.isArray(v)) {
        return v.length
          ? `${label(k)}:\n` + v.map((item) =>
            typeof item === "string" ? `- ${item}` : `- ${JSON.stringify(item)}`).join("\n")
          : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}
