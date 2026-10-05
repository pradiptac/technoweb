"use client";

import { useEffect } from "react";

/** Messages between the builder and the preview it frames — same origin only. */
export const BUILDER_SELECT = "tw:builder-select";
export const BUILDER_SHOW = "tw:builder-show";

/**
 * The live preview's half of the conversation with the builder (0.112.0,
 * `docs/page-builder.md` "Live preview").
 *
 * Only while framed: a press anywhere in a section (`[data-builder-id]`, put
 * there by `PageSections marked`) tells the parent which section it was, and
 * nothing in the preview navigates or submits — a link pressed there would
 * take the frame somewhere the builder cannot follow. The parent asks for a
 * section by id and the preview scrolls to it and outlines it for a moment.
 * Every message is checked for this origin and, inbound, for the parent as
 * its source.
 */
export function BuilderPreviewBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const html = document.documentElement;
    html.setAttribute("data-builder-preview", "");

    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest("[data-builder-id]") : null;
      // A button that only works here (a tab, a slider arrow) keeps working; a link or a submit does not.
      if (e.target instanceof Element && e.target.closest("a[href], button[type='submit'], input[type='submit']")) e.preventDefault();
      const id = target?.getAttribute("data-builder-id");
      if (id) window.parent.postMessage({ type: BUILDER_SELECT, id }, window.location.origin);
    };
    const onSubmit = (e: Event) => e.preventDefault();

    let flash: number | undefined;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const data = e.data as { type?: string; id?: unknown } | null;
      if (data?.type !== BUILDER_SHOW || typeof data.id !== "string") return;
      const el = document.querySelector(`[data-builder-id="${CSS.escape(data.id)}"]`);
      if (!el) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
      document.querySelectorAll("[data-builder-flash]").forEach((n) => n.removeAttribute("data-builder-flash"));
      el.setAttribute("data-builder-flash", "");
      window.clearTimeout(flash);
      flash = window.setTimeout(() => el.removeAttribute("data-builder-flash"), 1400);
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("message", onMessage);
    return () => {
      html.removeAttribute("data-builder-preview");
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("message", onMessage);
      window.clearTimeout(flash);
    };
  }, []);

  return null;
}
