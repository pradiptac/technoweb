"use client";

import { useEffect } from "react";

/**
 * The theme preview's half of the appearance screen's live preview
 * (2026-10-05). Mounted only by `/theme-preview/*`, which only a signed-in
 * member of staff can open.
 *
 * The settings screen frames this page and posts what it would save — the
 * palette as the same `theme-tokens` CSS the root layout renders, and the
 * corner and spacing choices — and this writes them in place: the token
 * stylesheet's text replaced, the two attributes set on the `.public-site`
 * wrapper exactly as `lookAttrs()` would. Nothing is saved and nothing else
 * on the page changes, so what the editor sees is the real page in the
 * look they have not committed to yet.
 *
 * Three checks before anything is touched: the message comes from this
 * origin, this page is in a frame, and the message has the one shape it
 * expects. The CSS is written as text into a `<style>`, which cannot run a
 * script, and the attribute values are checked against their lists.
 */
type LookMessage = { type: "tw:look"; css: string; radius: string; density: string; surface?: string; typeScale?: string };

const RADII = new Set(["soft", "sharp", "round"]);
const DENSITIES = new Set(["comfortable", "compact", "airy"]);
const SURFACES = new Set(["flat", "elevated", "outline", "soft", "glow"]);
const TYPE_SCALES = new Set(["standard", "compact", "large"]);

export function PreviewBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as Partial<LookMessage> | null;
      if (!m || m.type !== "tw:look" || typeof m.css !== "string" || m.css.length > 200_000) return;

      const tokens = document.getElementById("theme-tokens");
      if (tokens) tokens.textContent = m.css;

      const site = document.querySelector<HTMLElement>(".public-site");
      if (!site) return;
      if (m.radius && RADII.has(m.radius) && m.radius !== "soft") site.dataset.radius = m.radius;
      else delete site.dataset.radius;
      if (m.density && DENSITIES.has(m.density) && m.density !== "comfortable") site.dataset.density = m.density;
      else delete site.dataset.density;
      if (m.surface && SURFACES.has(m.surface) && m.surface !== "flat") site.dataset.surface = m.surface;
      else delete site.dataset.surface;
      if (m.typeScale && TYPE_SCALES.has(m.typeScale) && m.typeScale !== "standard") site.dataset.typeScale = m.typeScale;
      else delete site.dataset.typeScale;
    };
    window.addEventListener("message", onMessage);
    // Say so once ready, so the screen sends its current choice straight away.
    window.parent.postMessage({ type: "tw:look-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
