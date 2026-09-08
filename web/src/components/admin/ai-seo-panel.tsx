"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  decideSeoSuggestionAction,
  loadSeoAiAction,
  runSeoAiAction,
  seoAiContextAction,
} from "@/app/admin/(app)/seo/ai-actions";
import type { SeoAiActionKey, SeoAiMeta, SeoSuggestion } from "@/types/api";

/**
 * What an editor can put straight into the form, and what they cannot.
 *
 * Three of the six produce values this panel owns fields for, so they get an
 * Apply. The other three produce things that live elsewhere — a rewritten body
 * on the Content tab, FAQ rows in their own repeater, anchor text inside the
 * copy — and offering an Apply that quietly did nothing to them would be worse
 * than not offering one. Those get Copy, and a line saying where it goes.
 */
const APPLIES: Record<SeoAiActionKey, boolean> = {
  generate: true,
  analyze: true,
  schema: true,
  improve: false,
  faq: false,
  internal_links: false,
};

/** What the editor is meant to do with the ones this panel cannot apply. */
const WHERE: Partial<Record<SeoAiActionKey, string>> = {
  improve: "Paste into the body on the Content tab, then read it before saving.",
  faq: "Add these on the FAQs tab. Nothing is added for you.",
  internal_links: "Link these from the body copy where they fit the sentence.",
};

export type SeoAiPatch = {
  title?: string;
  description?: string;
  focus_keyword?: string;
  secondary_keywords?: string[];
  schema_type?: string;
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
export function AiSeoPanel({
  type, id, onApply,
}: {
  type: string;
  id: number;
  onApply: (patch: SeoAiPatch) => void;
}) {
  const [meta, setMeta] = useState<SeoAiMeta | null>(null);
  const [suggestions, setSuggestions] = useState<SeoSuggestion[]>([]);
  const [open, setOpen] = useState<SeoSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<SeoAiActionKey | null>(null);
  const [context, setContext] = useState<{ context: string; approximate_tokens: number } | null>(null);
  const [, startTransition] = useTransition();
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
      }
    });

    return () => { live = false; };
  }, [type, id]);

  const run = useCallback((action: SeoAiActionKey) => {
    setError(null);
    setRunning(action);

    startTransition(async () => {
      const res = await runSeoAiAction(action, type, id);
      setRunning(null);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setSuggestions((prev) => [res.data, ...prev]);
      setOpen(res.data);
      // The counter moved, so the "N left today" line beside the buttons has
      // to as well — a cap that only updates on a reload is one somebody
      // walks into.
      setMeta((m) => (m ? { ...m, today: { ...m.today, runs: m.today.runs + 1,
        remaining: m.today.remaining === null ? null : Math.max(0, m.today.remaining - 1) } } : m));
    });
  }, [type, id]);

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
    };

    onApply(patch);
    decide(suggestion, "applied");
    setOpen(null);
    toast({
      tone: "ok",
      title: "Put into the form",
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

  return (
    <section className="mt-1 mb-[18px] rounded-lg border border-line-strong bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[14px] font-semibold">AI assistant</h3>

        {/*
          The cap, before it bites.

          The chat overview exists partly because a daily ceiling whose first
          symptom is people being turned away is a ceiling nobody can plan
          around. `remaining` is null when uncapped, which reads as nothing
          rather than as zero.
        */}
        <p className="text-[12.5px] text-muted">
          {meta.today.remaining === null
            ? `${meta.today.runs} used today`
            : `${meta.today.remaining} of ${meta.today.cap} left today`}
        </p>
      </div>

      <p className="measure mt-1 text-[12.5px] text-muted">
        Suggestions only. Nothing is written to this record until you press Save.
      </p>

      {!meta.configured && (
        <p className="mt-3 text-[12.5px] text-warn">
          No OpenAI key is configured, so these will refuse. Settings → API keys.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {meta.actions.map((a) => (
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
        <p className="mt-2 text-[12.5px] text-warn">
          The daily limit has been reached. It resets at midnight.
        </p>
      )}

      {error && <p className="mt-2 text-[12.5px] text-err">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <button type="button" onClick={showContext} className="font-semibold text-brand-ink hover:underline">
          What the AI is told
        </button>

        {suggestions.length > 0 && (
          <span className="text-muted">
            {suggestions.length} previous suggestion{suggestions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {suggestions.slice(0, 5).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpen(s)}
                className="flex w-full items-center justify-between gap-3 rounded border border-line px-3 py-2 text-left text-[12.5px] hover:border-brand-300"
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
          <Suggestion suggestion={open} />
        </Modal>
      )}

      {context && (
        <Modal
          open
          onClose={() => setContext(null)}
          title="What the AI is told"
          description={`About ${context.approximate_tokens} tokens. Page copy sits between the fence markers and is treated as material, never as instructions.`}
        >
          <pre className="max-h-[24rem] overflow-auto rounded border border-line bg-surface-2 p-3 text-[12px] whitespace-pre-wrap">
            {context.context}
          </pre>
        </Modal>
      )}
    </section>
  );
}

/** The stored result, rendered by shape. */
function Suggestion({ suggestion }: { suggestion: SeoSuggestion }) {
  const r = suggestion.result as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const list = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).filter((v) => typeof v === "string") as string[] : []);

  return (
    <div className="grid gap-3 text-[13.5px]">
      {(["title", "description", "focus_keyword", "intent", "summary", "reason", "schema_type"] as const).map((k) =>
        text(k) ? (
          <div key={k}>
            <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-faint">{label(k)}</p>
            <p className="mt-0.5">{text(k)}</p>
          </div>
        ) : null,
      )}

      {(["secondary_keywords", "keywords", "strengths", "weaknesses", "gaps", "notes"] as const).map((k) =>
        list(k).length > 0 ? (
          <div key={k}>
            <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-faint">{label(k)}</p>
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

      {Array.isArray(r.links) && (
        <ul className="grid gap-2">
          {(r.links as { title: string; path: string; anchor: string; reason: string }[]).map((l, i) => (
            <li key={i} className="rounded border border-line p-2.5">
              <p className="font-semibold">{l.title}</p>
              <p className="font-mono text-[12px] text-muted">{l.path}</p>
              {l.anchor && <p className="mt-1">Anchor: “{l.anchor}”</p>}
              {l.reason && <p className="text-muted">{l.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {text("suggested") && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[.04em] text-faint">Suggested copy</p>
          <pre className="mt-0.5 max-h-[18rem] overflow-auto rounded border border-line bg-surface-2 p-3 text-[12.5px] whitespace-pre-wrap">
            {text("suggested")}
          </pre>
        </div>
      )}

      <p className="text-[12px] text-faint">
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
