"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@/components/ui/modal";
import { IconSparkle } from "@/components/icons-ui";

type Suggestion = { key: string; label: string };

type Answer = {
  matched: boolean;
  key: string | null;
  question: string | null;
  source: string;
  figure: string | number | null;
  sentence: string;
  href: string | null;
  suggestions: Suggestion[];
};

/**
 * Ask ALTIS (0.177.0, `docs/copilot.md`): a question about this install,
 * answered out of its own figures.
 *
 * **Every word a person reads here is the API's.** The sentence, the
 * figure and the link all arrive formed; nothing is composed in the
 * browser and nothing a model wrote is rendered — the model's whole part
 * is choosing which of a fixed list of questions was asked, and it never
 * sees a figure. So there is no path by which this can state a number the
 * console would not.
 *
 * It sits beside the "?" and opens the same way: a button from `sm`, the
 * account menu below it, and `tw:copilot` on `window` from anywhere.
 *
 * The suggestions are the API's list of what **this account** may ask —
 * narrowed by role before the browser sees it, so a support engineer is
 * never shown a question about revenue and never learns one exists.
 */
export function CopilotDrawer() {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Suggestion[] | null>(null);
  const [ai, setAi] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/copilot", { cache: "no-store" }).catch(() => null);

    if (!res?.ok) {
      setFailed(true);
      return;
    }

    const got = (await res.json()) as { data: Suggestion[]; meta: { ai: boolean } };
    setQuestions(got.data);
    setAi(got.meta.ai);
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    if (questions === null) void load();
  }, [load, questions]);

  useEffect(() => {
    const onOpen = () => show();
    window.addEventListener("tw:copilot", onOpen);
    return () => window.removeEventListener("tw:copilot", onOpen);
  }, [show]);

  const ask = useCallback(async (question: string) => {
    const asked = question.trim();
    if (!asked) return;

    setAsking(true);
    setFailed(false);

    const res = await fetch("/api/admin/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: asked }),
      cache: "no-store",
    }).catch(() => null);

    setAsking(false);

    if (!res?.ok) {
      setFailed(true);
      return;
    }

    setAnswer(((await res.json()) as { data: Answer }).data);
  }, []);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  // What to offer: the ones the answer named when nothing matched,
  // otherwise this account's whole list.
  const offer = answer && !answer.matched && answer.suggestions.length
    ? answer.suggestions
    : (questions ?? []);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Ask about this install"
        title="Ask ALTIS"
        onClick={show}
        data-tour="copilot"
        // From `sm`, like the "?" beside it: the bar is full on a phone,
        // where the account menu carries this instead.
        className="hidden size-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition-colors hover:border-faint hover:text-brand-ink sm:grid"
      >
        <IconSparkle className="size-4" />
      </button>

      <Modal open={open} onClose={close} title="Ask ALTIS" size="side" dataAttr="copilot-drawer">
        <div className="grid gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(q);
            }}
          >
            <label htmlFor="copilot-q" className="sr-only">
              Ask a question about this install
            </label>
            <div className="flex gap-2">
              <input
                ref={field}
                id="copilot-q"
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="How many tickets are open?"
                maxLength={300}
                autoComplete="off"
                className="w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-14 text-ink placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={asking || !q.trim()}
                className="shrink-0 rounded-lg bg-brand-600 px-4 text-14 font-semibold text-brand-on transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {asking ? "Asking…" : "Ask"}
              </button>
            </div>
          </form>

          {failed && (
            <p role="status" className="text-13 text-err">
              The console did not answer. Try again shortly.
            </p>
          )}

          {/*
            The answer. `role="status"` rather than `alert`: it is the
            reply to something somebody just asked for, so it waits for a
            gap rather than interrupting.
          */}
          {answer && (
            <div role="status" className="rounded-lg border border-line-strong bg-surface px-4 py-3">
              {answer.matched && answer.question && (
                <p className="text-12-5 text-muted">{answer.question}</p>
              )}

              {answer.matched && answer.figure !== null && (
                <p className="mt-1 text-24 font-semibold tabular-nums text-ink">{answer.figure}</p>
              )}

              <p className="measure mt-1 text-14 text-ink-2">{answer.sentence}</p>

              {answer.href && (
                <Link
                  href={answer.href}
                  onClick={close}
                  className="mt-2 inline-block text-13 font-semibold text-brand-ink underline"
                >
                  Open the list
                </Link>
              )}
            </div>
          )}

          {offer.length > 0 && (
            <div>
              <h3 className="mb-2 text-12-5 font-semibold tracking-wide text-muted uppercase">
                {answer && !answer.matched ? "Try one of these" : "What you can ask"}
              </h3>
              <ul className="grid gap-1.5">
                {offer.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setQ(s.label);
                        void ask(s.label);
                        field.current?.focus();
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-13-5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="measure text-12-5 text-muted">
            Every figure here is read from this install, by the same code the
            screen it links to uses.{" "}
            {ai
              ? "Wording it differently is understood."
              : "It matches on the words you type; switching the AI assistant on in Settings understands other wordings too."}
          </p>
        </div>
      </Modal>
    </>
  );
}
