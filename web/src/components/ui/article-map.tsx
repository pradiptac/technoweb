"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/headings";
import { cn } from "@/lib/utils";

/**
 * "On this page": the article's sections, with the one being read marked.
 *
 * Built from the ids `withHeadingIds()` stamped on the body. The current
 * section is whichever heading was last scrolled past the top third of the
 * viewport, found with an `IntersectionObserver` — the reveal observer's
 * sibling, and the same reason: reading `scrollY` on every frame is the
 * expensive way to know where the reader is. Rendered only with three or
 * more sections; a map of two entries is longer than the walk.
 *
 * Plain links to the anchors, so it works without JavaScript and each
 * section is a shareable address; `scroll-margin-top` on the headings is
 * in `globals.css`, so a jump does not land under the sticky header.
 */
export function ArticleMap({ headings, className, sticky = false }: { headings: Heading[]; className?: string; sticky?: boolean }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const targets = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      // The topmost heading that has crossed the line wins; scrolling up hands
      // the mark back to the one above it.
      const above = targets.filter((el) => el.getBoundingClientRect().top <= window.innerHeight * 0.33);
      const last = above[above.length - 1];
      if (last) setCurrent(last.id);
      else if (entries.length) setCurrent(targets[0].id);
    }, { rootMargin: "-33% 0px -60% 0px", threshold: [0, 1] });

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav aria-label="On this page" className={cn(sticky && "lg:sticky lg:top-[calc(var(--h-site-header)+1rem)]", className)}>
      <p className="mb-2 text-11-5 font-semibold uppercase tracking-[.1em] text-faint">On this page</p>
      <ol className="border-l border-line text-13-5">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={current === h.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l-2 py-1 pr-2 leading-snug transition-colors duration-(--duration-base)",
                h.level === 3 ? "pl-6" : "pl-3",
                current === h.id ? "border-brand-600 font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * A thin bar under the header showing how far through the article the
 * reader is. `scaleX` on a `position: fixed` element — the route loader's
 * recipe — so it cannot widen the document; measured against the article
 * element (`target`), not the page, so the footer and the related posts do
 * not count as unread. Hidden until the top of the article has been passed
 * and after its end, or a bar that says "0%" sits over the hero for no one.
 */
export function ReadingProgress({ target }: { target: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const read = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      setProgress(rect.top > 0 ? 0 : read);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [target]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[var(--h-site-header)] z-30 h-[3px] origin-left bg-brand-600 transition-[scale] duration-(--duration-fast) ease-out motion-reduce:transition-none"
      style={{ scale: `${progress} 1`, opacity: progress > 0 && progress < 1 ? 1 : 0 }}
    />
  );
}
