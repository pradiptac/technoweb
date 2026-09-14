"use client";

/**
 * Velora `vanish-input` — https://velora.colorlib.com/r/vanish-input.json,
 * installed 2026-09-14 (Velora by Colorlib, built on `motion`). As published
 * except for what a site search needs that a demo does not:
 *
 * - `action` and `name`, so the form is a real GET — the header search has
 *   always worked without JavaScript and its results stay shareable, and the
 *   published form (no action, `preventDefault` on submit) would have made
 *   Enter do nothing until hydration.
 * - `label`, an accessible name of its own; the published field borrowed its
 *   first placeholder, which is a hint, not a name.
 * - `inputClassName` / `buttonClassName`, because the header's strip is 38px
 *   and the published 48px pill and 36px button do not fit it.
 * - shadcn's tokens (`bg-background`, `bg-primary`, `ring-ring`, …) do not
 *   exist here and are mapped to this theme's.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface VanishInputProps {
  /** Cycled through while the field is empty */
  placeholders: string[];
  /** Seconds each placeholder is held */
  interval?: number;
  onSubmit?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  /** The field's accessible name. */
  label?: string;
  /** A real GET target, so the form works before hydration. */
  action?: string;
  name?: string;
  id?: string;
}

/**
 * The cycling placeholder on its own, for a field that has to stay what it
 * is — the shop's search is a combobox with picture suggestions, and
 * replacing it with the whole component would have thrown those away.
 * Visual only: the input it sits over keeps its own accessible name.
 */
export function CyclingPlaceholder({
  placeholders, interval = 3, active, className,
}: {
  placeholders: string[];
  interval?: number;
  /** False while the field has text; the span is not rendered then. */
  active: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (placeholders.length < 2 || !active) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % placeholders.length),
      interval * 1000
    );
    return () => window.clearInterval(id);
  }, [placeholders.length, interval, active]);

  if (!active) return null;

  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-y-0 left-5 flex items-center overflow-hidden text-sm text-muted", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: reducedMotion ? 0 : 0.25 }}
          className="block truncate"
        >
          {placeholders[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Search or prompt field whose placeholder cycles while empty. Built on a real
 * `form` and `input`, so Enter, autofill and screen readers behave normally.
 */
export function VanishInput({
  placeholders,
  interval = 3,
  onSubmit,
  className,
  inputClassName,
  buttonClassName,
  label,
  action,
  name,
  id,
}: VanishInputProps) {
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (placeholders.length < 2 || value) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % placeholders.length),
      interval * 1000
    );
    return () => window.clearInterval(id);
  }, [placeholders.length, interval, value]);

  const handleSubmit = (event: FormEvent) => {
    if (!onSubmit) return; // no handler: let the GET happen
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
    inputRef.current?.blur();
  };

  return (
    <form
      onSubmit={handleSubmit}
      action={action}
      method={action ? "get" : undefined}
      role={action ? "search" : undefined}
      data-slot="vanish-input"
      className={cn(
        "relative flex h-12 w-full max-w-lg items-center rounded-full border border-line-strong bg-card pr-1.5 pl-5 transition-shadow focus-within:ring-2 focus-within:ring-brand-100",
        className
      )}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={label ?? placeholders[0] ?? "Search"}
        className={cn("peer h-full min-w-0 flex-1 bg-transparent text-sm outline-none", inputClassName)}
      />

      {/* Visual only — the input keeps its own accessible label. */}
      {!value && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-5 flex h-full items-center overflow-hidden text-sm text-muted"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: reducedMotion ? 0 : 0.25 }}
              className="block"
            >
              {placeholders[index]}
            </motion.span>
          </AnimatePresence>
        </span>
      )}

      <button
        type="submit"
        aria-label="Search"
        disabled={!value.trim()}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-brand-on transition-opacity disabled:opacity-40",
          buttonClassName,
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 8h9M8.5 4l4 4-4 4" />
        </svg>
      </button>
    </form>
  );
}
