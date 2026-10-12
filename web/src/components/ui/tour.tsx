"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { TOURS, tourFor, type TourStep } from "@/lib/tours";

const KEY = (id: string) => `tw_tour:${id}`;

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

type Run = { id: string; steps: TourStep[]; i: number };

const shown = (s: TourStep) => visible(document.querySelector(s.target));

/** The first step from `from` (stepping by `dir`) whose target is on screen, or -1. */
function seek(steps: TourStep[], from: number, dir: 1 | -1): number {
  for (let i = from; i >= 0 && i < steps.length; i += dir) if (shown(steps[i]!)) return i;
  return -1;
}

/**
 * Runs a guided tour (docs/help-and-tours.md): once per browser on a first
 * visit from 768px wide, 1.2s after the page settles, or on demand from the
 * help drawer (`tw:tour-start`, detail `{id}`). One fixed frame with a huge
 * shadow dims the page around the target; the card sits below it, or above
 * when there is no room. Nothing moves between steps — a tour is driven by
 * Next and Back and must feel instant; the card fades in once, inside the
 * reduced-motion guard (`.tour-card` in globals.css).
 *
 * Done or Skip writes `tw_tour:<id>` = done and hands focus back to where it
 * was. A storage that throws counts as seen, so a private window is never
 * shown the same tour on every page.
 *
 * A tour starts by itself only once its first step's target is on screen —
 * the builder's lives on the Builder tab, so opening that tab later starts
 * it, and the Content tab never uses it up. Each step finds its target again
 * when shown and is passed over if it has gone; moving to another screen ends
 * the tour unmarked; a dialog opened over it keeps its own Escape and Tab.
 */
export function Tour() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [run, setRun] = useState<Run | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const start = useCallback((id: string) => {
    const def = TOURS[id];
    if (!def || document.querySelector("dialog[open]")) return;
    const steps = def.steps.filter(shown);
    if (!steps.length) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRun({ id, steps, i: 0 });
  }, []);

  // Another screen ends the tour, unmarked — adjusted during render, so the
  // old screen's card is never drawn over the new one.
  const here = `${path}?${search}`;
  const [shownOn, setShownOn] = useState(here);
  if (shownOn !== here) {
    setShownOn(here);
    setRun(null);
    setBox(null);
  }

  const finish = useCallback(() => {
    setRun((r) => {
      if (r) {
        try { localStorage.setItem(KEY(r.id), "done"); } catch { /* still closes */ }
      }
      return null;
    });
    returnTo.current?.focus?.();
  }, []);

  // A first visit, from 768px wide.
  useEffect(() => {
    const id = tourFor(path, search);
    if (!id || window.innerWidth < 768) return;
    let seen = true;
    try {
      seen = localStorage.getItem(KEY(id)) === "done"
        // An automated browser (the audits, every probe) never gets a tour
        // laid over the screen it is measuring, unless it asks for one.
        || (navigator.webdriver && localStorage.getItem("tw_tour_force") !== "1");
    } catch { /* counts as seen */ }
    if (seen) return;
    // Nothing starts until the first step's target is on screen (a closed tab
    // can open later). Then the rest of a streaming screen (the dashboard's
    // panels arrive after its shell) gets time: every target there, or the
    // count still for two seconds, up to eight.
    const def = TOURS[id]!;
    let last = -1;
    let still = 0;
    let since = 0;
    const t = window.setInterval(() => {
      if (!shown(def.steps[0]!)) { since = 0; last = -1; still = 0; return; }
      const found = def.steps.filter(shown).length;
      still = found === last ? still + 1 : 0;
      last = found;
      since += 400;
      if (since < 1200) return;
      if (found === def.steps.length || still >= 5 || since >= 8000) {
        window.clearInterval(t);
        start(id);
      }
    }, 400);
    return () => window.clearInterval(t);
  }, [path, search, start]);

  // On demand, from the help drawer.
  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      // After the drawer's own close has run, so its dialog is shut.
      if (id) window.setTimeout(() => start(id), 50);
    };
    window.addEventListener("tw:tour-start", onStart);
    return () => window.removeEventListener("tw:tour-start", onStart);
  }, [start]);

  const step = run ? run.steps[run.i] : undefined;

  const move = useCallback((dir: 1 | -1) => {
    setRun((r) => {
      if (!r) return r;
      const i = seek(r.steps, r.i + dir, dir);
      if (i >= 0) return { ...r, i };
      if (dir === -1) return r;
      // Nothing further on screen: going forward ends the tour.
      try { localStorage.setItem(KEY(r.id), "done"); } catch { /* still closes */ }
      return null;
    });
  }, []);

  useLayoutEffect(() => {
    if (!step) return;
    // Gone since the tour started (a list refreshed, a panel closed): pass it.
    const el = document.querySelector(step.target);
    if (!visible(el)) { move(1); return; }
    el.scrollIntoView({ block: "center" });
    const place = () => {
      const now = document.querySelector(step.target);
      if (visible(now)) setBox(now.getBoundingClientRect());
      else move(1);
    };
    place();
    card.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step, move]);

  // Escape skips; Tab stays inside the card.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened over the tour (the palette) keeps its own keys.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") { e.preventDefault(); finish(); return; }
      if (e.key !== "Tab" || !card.current) return;
      const f = [...card.current.querySelectorAll<HTMLElement>("button")];
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (!card.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, finish]);

  if (!run || !step || !box) return null;
  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = box.bottom + 230 < vh;
  const left = Math.min(Math.max(12, box.left), vw - 332);
  const top = below ? box.bottom + pad + 10 : Math.max(12, box.top - pad - 10 - 210);
  const last = run.i === run.steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-lg shadow-[0_0_0_9999px_color-mix(in_oklab,var(--color-dark)_55%,transparent)] ring-2 ring-brand-600"
        style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
      />
      <div
        ref={card}
        key={run.id}
        tabIndex={-1}
        data-tour-card
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="tour-card fixed w-80 rounded-xl border border-line-strong bg-card p-4 text-ink shadow-float outline-none"
        style={{ left, top }}
      >
        <p data-tour-step aria-live="polite" className="text-12 text-muted">Step {run.i + 1} of {run.steps.length}</p>
        <p id="tour-title" className="mt-1 text-15 font-semibold">{step.title}</p>
        <p id="tour-body" className="mt-1 text-13-5 text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="mr-auto rounded px-1 py-1 text-12-5 text-muted hover:text-ink">Skip tour</button>
          {run.i > 0 && (
            <button type="button" onClick={() => move(-1)} className="rounded-full border border-line-strong px-3 py-1.5 text-13 font-semibold">
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : move(1))}
            className="rounded-full bg-brand-600 px-3.5 py-1.5 text-13 font-semibold text-brand-on"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
