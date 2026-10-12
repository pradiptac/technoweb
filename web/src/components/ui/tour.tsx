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

type Run = { id: string; steps: (TourStep & { el: HTMLElement })[]; i: number };

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
    const steps = def.steps
      .map((s) => ({ ...s, el: document.querySelector(s.target) }))
      .filter((s): s is TourStep & { el: HTMLElement } => visible(s.el));
    if (!steps.length) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRun({ id, steps, i: 0 });
  }, []);

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
    // A screen can still be streaming in (the dashboard's panels arrive after
    // its shell): wait until every target is there, or the count has held
    // still for a second, up to six seconds.
    const def = TOURS[id]!;
    let last = -1;
    let still = 0;
    let waited = 0;
    const t = window.setInterval(() => {
      const found = def.steps.filter((s) => visible(document.querySelector(s.target))).length;
      still = found === last ? still + 1 : 0;
      last = found;
      waited += 400;
      if (waited < 1200) return;
      if (found === def.steps.length || still >= 3 || waited >= 6000) {
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

  useLayoutEffect(() => {
    if (!step) return;
    step.el.scrollIntoView({ block: "center" });
    const place = () => setBox(step.el.getBoundingClientRect());
    place();
    card.current?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

  // Escape skips; Tab stays inside the card.
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
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
            <button type="button" onClick={() => setRun({ ...run, i: run.i - 1 })} className="rounded-full border border-line-strong px-3 py-1.5 text-13 font-semibold">
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setRun({ ...run, i: run.i + 1 }))}
            className="rounded-full bg-brand-600 px-3.5 py-1.5 text-13 font-semibold text-brand-on"
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
