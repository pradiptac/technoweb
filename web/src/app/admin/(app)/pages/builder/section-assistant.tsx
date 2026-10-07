"use client";

import { useState } from "react";
import { IconChevronDown } from "@/components/icons-ui";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiSectionOptions } from "@/types/api";
import { wordSectionAction } from "./ai-section-action";

const BRIEF_MAX = 600;

/**
 * The assistant on a section card (0.127.0, docs/page-builder.md "The
 * assistant on a section"): write this section's wording from a line about
 * it, or reword, shorten or expand what it says.
 *
 * It changes **words only** — the API merges its answer onto the section's
 * own data, so a picture, a layout, where a button goes and the rows of a
 * list all stay as they are — and it saves nothing: the answer goes into the
 * builder's state through `onApply`, which records a history step, so Undo
 * (here, or the builder's own) puts the old wording back.
 *
 * Folded by default: it is a tool beside the fields, not a field. Everything
 * it says is inline — the refusal under the control it belongs to, the
 * outcome in a `role="status"` line that is mounted empty so the change is
 * announced. No toast: the editor is looking at this card.
 *
 * The modes and the types it works on are the API's (`options`), never a
 * list here. The controls are unnamed and every button is `type="button"`,
 * because the card sits inside the page's `<form>`.
 */
export function SectionAssistant({ options, type, data, idPrefix, onApply, onUndo }: {
  options: AiSectionOptions;
  type: string;
  data: Record<string, unknown>;
  idPrefix: string;
  onApply: (data: Record<string, unknown>) => void;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(options.modes[0]?.value ?? "write");
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; field: "brief" | "section" } | null>(null);
  // What the assistant last put in; Undo is offered only while it is still what the section holds.
  const [applied, setApplied] = useState<{ data: Record<string, unknown>; label: string } | null>(null);

  const current = options.modes.find((m) => m.value === mode) ?? options.modes[0];
  const panelId = `${idPrefix}-assistant`;
  const briefId = `${idPrefix}-assistant-brief`;
  const fresh = applied !== null && applied.data === data;

  const run = async () => {
    if (!current || pending) return;
    setError(null);
    setPending(true);
    const result = await wordSectionAction({ mode: current.value, type, data, brief });
    setPending(false);

    if (!result.data) {
      setError({ text: result.error ?? "The assistant could not do that. Try again shortly.", field: result.field ?? "section" });
      return;
    }
    setApplied({ data: result.data, label: current.label });
    onApply(result.data);
  };

  return (
    <div data-section-assistant className="mb-5 rounded-lg border border-brand-ink/25 bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-13 font-semibold text-brand-ink"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 4.9L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.6z" />
          <path d="M19 15l.7 1.9 1.8.6-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.6z" />
        </svg>
        <span>Assistant</span>
        <span className="min-w-0 flex-1 truncate font-normal text-muted">write, reword, shorten or expand this section’s wording</span>
        <IconChevronDown className={cn("size-4 shrink-0 text-muted transition-[rotate] duration-(--duration-base)", open ? "rotate-0" : "-rotate-90")} />
      </button>

      {open && (
        <div id={panelId} className="border-t border-line p-3">
          {!options.available ? (
            <p className="measure text-13 text-ink-2">{options.reason ?? "The assistant is not available on this server yet."}</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="What the assistant should do">
                {options.modes.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={m.value === mode}
                    onClick={() => { setMode(m.value); setError(null); }}
                    className={cn(
                      "min-h-8 rounded-md border px-3 text-13 font-semibold transition-colors duration-(--duration-fast)",
                      m.value === mode ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card text-ink-2 hover:border-brand-300",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {current && <p className="measure mb-3 text-12-5 text-muted">{current.blurb}</p>}

              <Field
                label={current?.needs_brief ? "What should this section say?" : "Anything to keep in mind? (optional)"}
                htmlFor={briefId}
                error={error?.field === "brief" ? error.text : undefined}
                hint={`${brief.length} / ${BRIEF_MAX}`}
                className="mb-3"
              >
                <Textarea
                  id={briefId}
                  rows={current?.needs_brief ? 3 : 2}
                  maxLength={BRIEF_MAX}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={current?.needs_brief
                    ? "Why a small office should let us manage its Wi-Fi: surveyed first, one monthly price, somebody to ring."
                    : "Plainer words; our readers are office managers, not engineers."}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" onClick={run} pending={pending}>
                  {pending ? "Working…" : current?.label ?? "Run"}
                </Button>
                <p className="measure min-w-0 flex-1 text-12 text-faint">
                  Words only: pictures, links, layout and the rows of a list stay as they are. Bold and italics in a
                  text are not kept. Nothing is saved until you save the page.
                </p>
              </div>

              {error?.field === "section" && <p role="alert" className="measure mt-3 text-13 text-err">{error.text}</p>}

              {/* Mounted empty, so the outcome is announced when it appears. */}
              <p role="status" className={cn("text-13 text-ink-2", (pending || fresh) && "mt-3")}>
                {pending && "Working… this can take up to a minute."}
                {!pending && fresh && (
                  <>
                    {applied.label === "Write" ? "Written." : `${applied.label} done.`} Read it through — anything marked [CHECK: …] is a fact for you to confirm.{" "}
                    <button type="button" onClick={() => { onUndo(); setApplied(null); }} className="font-semibold text-brand-ink underline">
                      Undo
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
