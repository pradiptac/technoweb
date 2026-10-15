import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Spot illustrations for empty, error and offline states (2026-10-05).
 *
 * Drawn here rather than vendored: ten small scenes in the icon set's own
 * hand — round caps and joins, 1.7 at the 24px scale, which is 2.4 in this
 * 120 × 96 box — so an empty list and the glyphs around it read as one
 * product. Every colour is a token mixed into `--color-card`, which inverts,
 * so each scene is drawn in the palette chosen in the console and repaints in
 * the dark scheme with no second set:
 *
 *   wash    — the soft ground the scene sits on, brand at 12% into the card
 *   fill    — an object's face, brand at 22%
 *   line    — the drawing, `ink-2` at 70%: present, never louder than words
 *   accent  — one spark of the accent colour, the thing the eye lands on
 *
 * No text inside any of them (an SVG label scales with its box and lands
 * under the 12px floor), and every one is `aria-hidden`: the heading beside
 * it says what it means.
 */
export type IllustrationName =
  | "empty" | "search" | "inbox" | "chart" | "calendar" | "people" | "document" | "offline" | "lost" | "done";

const C = {
  wash: "color-mix(in oklab, var(--color-brand-500) 12%, var(--color-card))",
  fill: "color-mix(in oklab, var(--color-brand-500) 22%, var(--color-card))",
  card: "var(--color-card)",
  line: "color-mix(in oklab, var(--color-ink-2) 70%, var(--color-card))",
  accent: "var(--color-accent-500)",
  brand: "var(--color-brand-500)",
} as const;

const stroke = { stroke: C.line, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

/** The ground every scene shares: a soft blob, and two sparks. */
function Ground() {
  return (
    <>
      <path d="M18 58c-6-20 8-40 30-44 18-3 30 4 44 2 14-2 22 10 20 26-2 15 6 26-6 36-14 11-34 8-52 9-18 1-30-9-36-29z" fill={C.wash} />
      <path d="M100 14v6M97 17h6" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="30" r="2" fill={C.accent} />
    </>
  );
}

const SCENES: Record<IllustrationName, () => ReactElement> = {
  empty: () => (
    <>
      <path d="M34 46l26-12 26 12-26 12z" {...stroke} fill={C.card} />
      <path d="M34 46v22l26 12 26-12V46" {...stroke} fill={C.fill} />
      <path d="M60 58v22" {...stroke} />
      <path d="M34 46l-8 9 26 12 8-9M86 46l8 9-26 12-8-9" {...stroke} fill={C.card} />
    </>
  ),
  search: () => (
    <>
      <rect x="30" y="20" width="44" height="56" rx="5" {...stroke} fill={C.card} />
      <path d="M38 32h28M38 41h20M38 50h24" {...stroke} />
      <circle cx="74" cy="58" r="13" {...stroke} fill={C.fill} />
      <path d="M83.5 67.5L94 78" {...stroke} strokeWidth={3.2} />
      <path d="M69 54a7 7 0 0 1 7-3" stroke={C.card} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  inbox: () => (
    <>
      <rect x="40" y="18" width="40" height="30" rx="3" {...stroke} fill={C.card} transform="rotate(-6 60 33)" />
      <path d="M44 26l16 10 16-12" {...stroke} transform="rotate(-6 60 33)" />
      <path d="M28 52h18l4 9h20l4-9h18v20a5 5 0 0 1-5 5H33a5 5 0 0 1-5-5z" {...stroke} fill={C.fill} />
      <path d="M28 52l8-12h8M92 52l-8-12h-8" {...stroke} />
    </>
  ),
  chart: () => (
    <>
      <rect x="26" y="20" width="68" height="56" rx="6" {...stroke} fill={C.card} />
      <path d="M36 66V52M50 66V40M64 66V46M78 66V32" stroke={C.fill} strokeWidth="8" strokeLinecap="round" />
      <path d="M36 50l14-12 14 6 14-14" {...stroke} />
      <circle cx="78" cy="30" r="3.2" fill={C.accent} />
    </>
  ),
  calendar: () => (
    <>
      <rect x="28" y="24" width="64" height="52" rx="6" {...stroke} fill={C.card} />
      <path d="M28 38h64" {...stroke} />
      <rect x="28.5" y="24.5" width="63" height="13" rx="6" fill={C.fill} />
      <path d="M44 18v12M76 18v12" {...stroke} />
      <path d="M40 48h6M54 48h6M68 48h6M40 60h6M54 60h6" {...stroke} />
      <circle cx="71" cy="61" r="5" fill={C.accent} />
    </>
  ),
  people: () => (
    <>
      <circle cx="46" cy="38" r="9" {...stroke} fill={C.fill} />
      <path d="M30 72c1-11 8-18 16-18s15 7 16 18" {...stroke} fill={C.fill} />
      <circle cx="74" cy="42" r="8" {...stroke} fill={C.card} />
      <path d="M62 74c1-10 6-16 12-16s12 6 13 16" {...stroke} fill={C.card} />
    </>
  ),
  document: () => (
    <>
      <path d="M38 18h30l14 14v44a4 4 0 0 1-4 4H38a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4z" {...stroke} fill={C.card} />
      <path d="M68 18v10a4 4 0 0 0 4 4h10" {...stroke} fill={C.fill} />
      <path d="M44 44h28M44 53h28M44 62h18" {...stroke} />
      <circle cx="80" cy="70" r="9" fill={C.accent} />
      <path d="M76 70l3 3 5-6" stroke={C.card} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  offline: () => (
    <>
      <path d="M38 66h46a14 14 0 0 0 1-28 20 20 0 0 0-38-4 16 16 0 0 0-9 32z" {...stroke} fill={C.fill} />
      <path d="M30 24l60 50" {...stroke} strokeWidth={3} />
      <path d="M50 54a12 12 0 0 1 20 0" {...stroke} />
      <circle cx="60" cy="60" r="2.6" fill={C.line} />
    </>
  ),
  lost: () => (
    <>
      <path d="M60 22v56" {...stroke} />
      <path d="M60 28h24l8 7-8 7H60z" {...stroke} fill={C.fill} />
      <path d="M60 46H36l-8 7 8 7h24z" {...stroke} fill={C.card} />
      <path d="M48 78h24" {...stroke} />
      <circle cx="60" cy="20" r="3" fill={C.accent} />
    </>
  ),
  done: () => (
    <>
      <circle cx="60" cy="48" r="24" {...stroke} fill={C.fill} />
      <path d="M49 48l8 8 15-16" stroke={C.brand} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M30 26l4 4M90 26l-4 4M28 70l5-2M92 70l-5-2" {...stroke} />
    </>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  const Scene = SCENES[name];
  return (
    <svg aria-hidden viewBox="0 0 120 96" className={cn("h-24 w-30", className)} data-illustration={name}>
      <Ground />
      <Scene />
    </svg>
  );
}
