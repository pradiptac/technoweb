"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * AOS-style scroll reveals. Author with `data-aos="fade-up"` on any element,
 * optionally `data-aos-delay="100"` (milliseconds) to stagger a grid.
 *
 * Renders nothing — it exists to own the observer lifecycle. Mounted once in
 * the root layout; a no-op on any tree that carries no `data-aos` attributes.
 *
 * Three things this deliberately gets right:
 *
 * 1. The hidden start state lives behind `html[data-aos-ready]`, which is set
 *    HERE, in an effect. So the markup renders visible on the server and
 *    stays visible if JavaScript never runs — the content is never hostage
 *    to a script that may not arrive.
 * 2. It bails out entirely under prefers-reduced-motion. globals.css kills
 *    `transition` with !important for those users, so an element left at
 *    opacity 0 would never come back — a blank page. Never arming the
 *    attribute means nothing is ever hidden in the first place.
 * 3. Reveals fire once. Each element is unobserved as it lands, so nothing
 *    re-hides when the user scrolls back up.
 */
export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;

    // Hazard 2: honour the OS setting. Leave everything visible and static.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Older browsers without IntersectionObserver keep the un-hidden markup.
    if (!("IntersectionObserver" in window)) return;

    // Hazard 1: only now, once JS is running, is it safe to hide anything.
    root.setAttribute("data-aos-ready", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-aos-animate", "");
          observer.unobserve(entry.target);
        }
      },
      // Fire a little before the element is fully in view, so the reveal
      // finishes about when the reader's eye arrives.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    const observe = (el: Element) => {
      if (!el.hasAttribute("data-aos-animate")) observer.observe(el);
    };

    document.querySelectorAll("[data-aos]").forEach(observe);

    // App Router navigations swap the page under a layout that never
    // remounts, and Suspense boundaries stream content in late — so watch
    // for nodes that appear after the initial pass.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-aos]")) observe(node);
          node.querySelectorAll?.("[data-aos]").forEach(observe);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeAttribute("data-aos-ready");
    };
  }, [pathname]);

  return null;
}
