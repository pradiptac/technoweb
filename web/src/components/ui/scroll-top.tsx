"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * How far down the page you are, and a way back to the top of it.
 *
 * The console's list screens run to a hundred rows and its forms to two
 * screens of fields, and the browser's own way back — Home, or a long swipe —
 * is one most people do not know or cannot reach one-handed.
 *
 * The ring is the reading and the number is the same reading spelled out; the
 * arrow replaces the number on hover and focus, because at the moment you are
 * about to press it what you want confirmed is what it does, not where you
 * are.
 *
 * Two things it deliberately does not do. It does not appear until you are a
 * screenful down — a control that offers to scroll you to a top you can
 * already see is furniture. And it does not animate the percentage: a spring
 * on a value that changes with every scroll event is a spring that never
 * settles.
 */
export function ScrollTop({ className }: { className?: string }) {
  const [pct, setPct] = useState(0);
  const [shown, setShown] = useState(false);
  const [lift, setLift] = useState(0);
  const pathname = usePathname();
  const bar = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const read = () => {
      const doc = document.documentElement;
      // The distance actually scrollable. Zero on a page shorter than the
      // window, which would otherwise divide by nothing and report NaN%.
      const max = doc.scrollHeight - window.innerHeight;
      const y = window.scrollY;

      setShown(y > window.innerHeight * 0.6);
      setPct(max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((y / max) * 100))));

      /*
       * Sit above the form action bar, measured from where that bar actually
       * is rather than from how tall it is.
       *
       * `FormActions` is `sticky bottom-0`, which pins it to the bottom of the
       * viewport only while there is content below it — at the end of the page
       * it settles into flow above the footer. Offsetting by its *height* was
       * therefore right everywhere except the one place people scroll to, and
       * at 360px, where the bar wraps to two rows, the button landed beside
       * Cancel with Delete underneath it.
       *
       * Read on every scroll because that position changes with every scroll.
       */
      const top = bar.current?.getBoundingClientRect().top;
      setLift(top === undefined ? 0 : Math.max(0, Math.round(window.innerHeight - top + 12)));
    };

    read();
    window.addEventListener("scroll", read, { passive: true });
    // A resize changes scrollHeight — and so the percentage — without any
    // scrolling happening at all.
    window.addEventListener("resize", read);

    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  /*
   * Which bar to measure, re-found per route: this component is mounted once
   * by the layout and the form bar comes and goes with the page inside it.
   * Firing a scroll event afterwards is what makes the new answer take effect
   * without duplicating the measuring code here.
   */
  useEffect(() => {
    bar.current = document.querySelector<HTMLElement>("[data-form-actions]");
    window.dispatchEvent(new Event("scroll"));
  }, [pathname]);

  const r = 17;
  const circumference = 2 * Math.PI * r;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      // Hidden from everything, not just from sight, while it is out of use:
      // `invisible` alone leaves it in the tab order, so the first Tab on a
      // freshly loaded page would land on a control nobody can see.
      aria-hidden={!shown}
      tabIndex={shown ? undefined : -1}
      aria-label={`Back to top — ${pct}% down the page`}
      title="Back to top"
      style={lift ? { bottom: lift } : undefined}
      className={cn(
        "group fixed z-40 grid size-11 place-items-center rounded-full border border-line-strong",
        "bg-card/95 text-muted shadow-2 backdrop-blur-[6px] transition-all duration-200 ease-brand",
        "hover:border-brand-600 hover:text-brand-ink",
        "right-4 bottom-5",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        className,
      )}
    >
      {/*
        No text inside the SVG: `getComputedStyle` reports an SVG font size in
        user units, so a label in here is a size nothing else on the page
        agrees about. The figure sits over it in ordinary HTML.
      */}
      <svg
        aria-hidden
        viewBox="0 0 40 40"
        className="pointer-events-none absolute inset-0 size-full -rotate-90"
      >
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="2.5"
          className="text-surface-2" stroke="currentColor" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="2.5"
          strokeLinecap="round" stroke="currentColor"
          className="text-brand-600 transition-[stroke-dasharray] duration-150"
          strokeDasharray={`${(circumference * pct) / 100} ${circumference}`} />
      </svg>

      <span className="pointer-events-none text-[11px] font-semibold tabular-nums group-hover:hidden group-focus-visible:hidden">
        {pct}
      </span>
      <svg
        aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
        className="pointer-events-none hidden size-4 group-hover:block group-focus-visible:block"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
