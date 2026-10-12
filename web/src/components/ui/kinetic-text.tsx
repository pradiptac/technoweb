"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMotionOk } from "@/lib/hooks/use-carousel";
import { findMark, splitLast, type KineticEffect } from "@/lib/kinetic";

/**
 * A hero heading that moves (0.171.0, docs/motion.md "Kinetic headings").
 *
 * The server renders the finished words: a `sr-only` copy that is the
 * heading's text for a screen reader (and its accessible name, through the
 * heading's `aria-labelledby`, when a Pause button sits inside it), and an
 * `aria-hidden` copy split into words and letters that the effect plays on.
 * Every box is its final size from the first frame — a letter is hidden by
 * opacity, a scrambled glyph is drawn over a transparent final one, the
 * rotating slot holds every word in one grid cell — so nothing shifts.
 *
 * The hidden start state is CSS inside `prefers-reduced-motion:
 * no-preference` *and* `scripting: enabled` (globals.css, "Kinetic
 * headings"), so no-JS and reduced-motion visitors see the heading at once.
 * If the island never arms — a failed chunk, a hydration error — a 3s
 * failsafe animation reveals it anyway. An automated browser gets the final
 * state unless `tw_kinetic_force` is "1" (the tours' rule), so the audits
 * grade finished text. Attributes are written to the DOM from the effects,
 * never through React state, except rotate's word, which React renders.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*";
const TYPE_STEP = 38;
const TYPE_CAP = 1600;
const DECODE_EACH = 600;
const DECODE_STAGGER = 30;
const ROTATE_DWELL = 2400;

function automated(): boolean {
  try {
    return navigator.webdriver === true && localStorage.getItem("tw_kinetic_force") !== "1";
  } catch {
    return navigator.webdriver === true;
  }
}

export function KineticText({ text, effect, words, id, lastWordClassName }: {
  text: string;
  effect: KineticEffect;
  words: string[];
  /** The `sr-only` copy's id, which the heading names itself by when rotating. */
  id: string;
  lastWordClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionOk = useMotionOk();
  const alts = effect === "rotate" ? [splitLast(text).last, ...words] : [];
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [running, setRunning] = useState(false);

  // Arm, wait until the heading is half in view, play once.
  useEffect(() => {
    const el = ref.current;
    if (!el || effect === "none") return;
    el.dataset.kineticArmed = "";
    // `useMotionOk` reads false until it has asked; this effect runs again when it answers.
    if (!motionOk) return;
    if (automated()) { el.dataset.kineticDone = ""; return; }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const finish = () => {
      if (cancelled) return;
      el.dataset.kineticDone = "";
      delete el.dataset.kineticRun;
    };

    const start = () => {
      el.dataset.kineticRun = "";
      const chars = Array.from(el.querySelectorAll<HTMLElement>("[data-k-char]"));
      if (effect === "type") {
        const step = Math.min(TYPE_STEP, TYPE_CAP / Math.max(chars.length, 1));
        chars.forEach((c, i) => {
          timers.push(setTimeout(() => {
            chars[i - 1]?.removeAttribute("data-caret");
            c.dataset.on = "";
            c.dataset.caret = "";
            if (i === chars.length - 1) {
              timers.push(setTimeout(() => { c.removeAttribute("data-caret"); finish(); }, 1200));
            }
          }, i * step));
        });
      } else if (effect === "decode") {
        const t0 = performance.now();
        // rAF does not fire in a hidden tab, so the scramble simply resumes when it returns.
        const tick = (now: number) => {
          if (cancelled) return;
          let left = 0;
          chars.forEach((c, i) => {
            const at = now - t0 - i * DECODE_STAGGER;
            if (at < 0) { left++; return; }
            if (at < DECODE_EACH) {
              left++;
              c.dataset.on = "";
              c.dataset.s = "";
              c.dataset.g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            } else if (c.hasAttribute("data-s") || !c.hasAttribute("data-on")) {
              c.dataset.on = "";
              c.removeAttribute("data-s");
              c.removeAttribute("data-g");
            }
          });
          if (left > 0) raf = requestAnimationFrame(tick);
          else finish();
        };
        raf = requestAnimationFrame(tick);
      } else if (effect === "highlight") {
        timers.push(setTimeout(finish, 1100));
      } else if (effect === "rotate") {
        setRunning(true);
      }
    };

    let io: IntersectionObserver | null = null;
    try {
      io = new IntersectionObserver(([e]) => {
        if (e?.isIntersecting) { io?.disconnect(); start(); }
      }, { threshold: 0.5 });
      io.observe(el);
    } catch {
      finish();
    }
    return () => { cancelled = true; io?.disconnect(); timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [effect, motionOk]);

  // Rotating words: one full round, held by the button, the pointer or a
  // hidden tab, then back on its own word and done. Counted in a ref so the
  // interval never reads stale state; nothing is set in an updater.
  const steps = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!running || !playing || !el) return;
    let held = false;
    const hold = () => { held = true; };
    const go = () => { held = false; };
    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerleave", go);
    const t = setInterval(() => {
      if (held || document.hidden) return;
      steps.current += 1;
      const next = steps.current % alts.length;
      setCur(next);
      if (next === 0) {
        el.dataset.kineticDone = "";
        delete el.dataset.kineticRun;
        setRunning(false);
      }
    }, ROTATE_DWELL);
    return () => { clearInterval(t); el.removeEventListener("pointerenter", hold); el.removeEventListener("pointerleave", go); };
  }, [running, playing, alts.length]);

  const lettered = (s: string): ReactNode => {
    const parts = s.split(/(\s+)/);
    let lastIdx = -1;
    parts.forEach((p, i) => { if (p.trim() !== "") lastIdx = i; });
    return parts.map((p, i) => (p.trim() === "" ? <Fragment key={i}>{p}</Fragment> : (
      <span key={i} className={cn("whitespace-nowrap", i === lastIdx && lastWordClassName)}>
        {Array.from(p).map((ch, k) => <span key={k} data-k-char="">{ch}</span>)}
      </span>
    )));
  };

  let body: ReactNode;
  if (effect === "type" || effect === "decode") {
    body = lettered(text);
  } else if (effect === "highlight") {
    const m = findMark(text, words[0]);
    body = (
      <>
        {m.before}
        <span className={cn("k-markword", m.after.trim() === "" && lastWordClassName)}>
          {m.mark}
          <svg className="k-mark" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M3 8 C 50 3, 120 3, 197 7" pathLength={1} />
          </svg>
        </span>
        {m.after}
      </>
    );
  } else if (effect === "rotate") {
    const { head } = splitLast(text);
    body = (
      <>
        {head ? `${head} ` : null}
        <span className={cn("k-slot", lastWordClassName)}>
          {alts.map((a, i) => <span key={i} data-k-alt="" data-cur={i === cur ? "" : undefined}>{a}</span>)}
        </span>
      </>
    );
  } else {
    body = text;
  }

  return (
    <span ref={ref} className="kinetic" data-kinetic={effect}>
      <span id={id} className="sr-only">{text}</span>
      <span aria-hidden="true">{body}</span>
      {effect === "rotate" && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the moving words" : "Play the moving words"}
          aria-pressed={!playing}
          tabIndex={running ? undefined : -1}
          className={cn(
            "k-pause ml-2 inline-grid size-7 place-items-center rounded-full border border-line-strong bg-card align-middle text-ink",
            !running && "invisible",
          )}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          )}
        </button>
      )}
    </span>
  );
}
