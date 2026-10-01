"use client";

import { useState } from "react";
import { IconMapPin } from "@/components/icons-ui";

/**
 * The office map, which contacts Google only once somebody asks for it.
 *
 * The plain `<iframe>` it replaces was `loading="lazy"` and still cost the
 * contact page 430KB of Google Maps script on load — measured by
 * `npm run perf` on 2026-09-18, where every other route carried ~295KB of
 * JavaScript and `/contact` 723KB — and it set Google's cookies before
 * anybody had agreed to anything. This site takes the other position
 * everywhere else: `Analytics` renders nothing until consent is given, and
 * the blog's YouTube embed is a poster until it is pressed. The map is the
 * same shape: a card this application draws itself, with the address on it,
 * and the frame is mounted on the first press. Nothing leaves the browser
 * until then.
 *
 * The `src` is still the setting the API validated against Google's embed
 * host on write, because an unchecked one is somebody else's page inside
 * this origin.
 */
export function MapEmbed({ src, address, company }: { src: string; address?: string | null; company: string }) {
  const [shown, setShown] = useState(false);

  if (shown) {
    return (
      <iframe
        src={src}
        title={`Map showing the ${company} office`}
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-[320px] w-full border-0 lg:h-[420px]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="group flex h-[320px] w-full flex-col items-center justify-center gap-4 bg-linear-135 from-brand-50 to-surface-2 px-6 text-center transition-opacity duration-(--duration-base) hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:h-[420px]"
    >
      <span className="grid size-14 place-items-center rounded-full bg-card text-brand-ink shadow-3 transition-[scale] duration-(--duration-base) motion-safe:group-hover:scale-105">
        <IconMapPin className="size-6" />
      </span>
      {address && <span className="max-w-[40ch] whitespace-pre-line text-14 leading-relaxed text-ink">{address}</span>}
      <span className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-13-5 font-semibold text-brand-on">Show the map</span>
      <span className="text-12-5 text-muted">Loads from Google Maps, which sets its own cookies.</span>
    </button>
  );
}
