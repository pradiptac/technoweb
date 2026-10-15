"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { zoomFor, type MapBox as Box } from "./map-zoom";

/**
 * The support network's island (docs/support-network.md): country chips that
 * zoom the server-drawn map and narrow the list, and the join between a pin
 * and its card. It never re-renders the map — the outlines are the server's
 * markup, handed in as children — and writes only a transform, a custom
 * property and two attributes, so the 67KB of outlines stay out of the
 * client bundle.
 */
export function SupportNetworkControls({
  countries, boxes, start, mapWidth, mapHeight, children,
}: {
  countries: { code: string; name: string; count: number }[];
  boxes: Record<string, Box>;
  start: string | null;
  mapWidth: number;
  mapHeight: number;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [country, setCountry] = useState<string | null>(start);

  // Map units per screen pixel, so a pin is the same size on a phone and a
  // desktop (`--px`, read by the pin rules beside `--s`, the zoom).
  useEffect(() => {
    const svg = root.current?.querySelector<SVGSVGElement>("[data-support-map]");
    if (!svg) return;
    const measure = () => svg.style.setProperty("--px", String(Math.max(svg.clientWidth / mapWidth, svg.clientHeight / mapHeight) || 1));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [mapWidth, mapHeight]);

  const choose = (code: string | null) => {
    setCountry(code);
    const el = root.current;
    if (!el) return;
    const z = zoomFor(code ? boxes[code] ?? null : null, mapWidth, mapHeight);
    el.querySelector<SVGGElement>("[data-map-zoom]")?.style.setProperty("transform", z.transform);
    el.querySelector<SVGSVGElement>("[data-support-map]")?.style.setProperty("--s", String(z.s));
    el.querySelectorAll<HTMLElement>("[data-country-group]").forEach((g) => {
      g.hidden = !!code && g.dataset.countryGroup !== code;
    });
  };

  const active = useRef<string | null>(null);
  const mark = (slug: string | null) => {
    active.current = slug;
    const el = root.current;
    if (!el) return;
    el.querySelectorAll("[data-pin][data-active], [data-centre-card][data-active]").forEach((n) => n.removeAttribute("data-active"));
    if (!slug) return;
    el.querySelector(`[data-pin="${CSS.escape(slug)}"]`)?.setAttribute("data-active", "");
    el.querySelector(`[data-centre-card="${CSS.escape(slug)}"]`)?.setAttribute("data-active", "");
  };

  const cardOf = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>("[data-centre-card]")?.dataset.centreCard ?? null;

  return (
    <div
      ref={root}
      onClick={(e) => {
        const pin = (e.target as Element).closest?.<SVGGElement>("[data-pin]");
        const slug = pin?.dataset.pin;
        if (!slug) return;
        const card = root.current?.querySelector<HTMLElement>(`[data-centre-card="${CSS.escape(slug)}"]`);
        if (!card) return;
        const code = card.closest<HTMLElement>("[data-country-group]")?.dataset.countryGroup ?? null;
        if (country && code && code !== country) choose(code);
        mark(slug);
        card.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        card.focus({ preventScroll: true });
      }}
      // On a move, never `pointerover`: scrolling to a pressed pin's card slides
      // other cards under a still pointer, and that is not the reader's choice.
      onPointerMove={(e) => { const s = cardOf(e.target); if (s && s !== active.current) mark(s); }}
      onFocus={(e) => { const s = cardOf(e.target); if (s) mark(s); }}
    >
      {countries.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show a country">
          {[{ code: null as string | null, name: "All countries", count: countries.reduce((n, c) => n + c.count, 0) }, ...countries].map((c) => (
            <button
              key={c.code ?? "all"}
              type="button"
              aria-pressed={country === c.code}
              onClick={() => choose(c.code)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-13-5 font-semibold transition-colors duration-(--duration-base)",
                country === c.code
                  ? "border-brand-600 bg-brand-600 text-brand-on"
                  : "border-line-strong bg-(--color-card) text-ink hover:border-brand-600 hover:text-brand-ink",
              )}
            >
              {c.name}
              <span className={cn("rounded-full px-1.5 text-12", country === c.code ? "bg-brand-700 text-brand-on" : "bg-surface-2 text-muted")}>{c.count}</span>
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
