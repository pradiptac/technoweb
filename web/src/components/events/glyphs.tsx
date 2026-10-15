import { base, type P } from "@/components/icon-base";

/**
 * The chrome glyphs the events pages draw beside a fact — a date, a time, a
 * screen, a room of people — and the mark for a link that leaves the site.
 *
 * In a module of their own, with no directive, for the bundle rule
 * (`CLAUDE.md`, "Bundles"): the registration panel is a client component,
 * and a glyph imported from `components/icons.tsx` would bring all ~130 of
 * that file's icons into every event page's JavaScript. These import only
 * `icon-base`, so the server components and the client island share them
 * and neither pays for the map.
 *
 * Drawn to `base` — stroke 1.7, round caps — like every icon in the set, and
 * measured at 16px, which is the size all four are used at. They do a job
 * rather than stand for a thing, so they keep `currentColor`.
 */

/** A calendar leaf with its two rings. */
export const GlyphCalendar = (p: P) => (
  <svg {...base} {...p}><rect x="3.4" y="5" width="17.2" height="15.6" rx="2.2" /><path d="M3.4 10h17.2M8 3.2v3.6M16 3.2v3.6" /></svg>
);

/** A clock at ten past ten, give or take. */
export const GlyphClock = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.6" /><path d="M12 7.2V12l3.2 2" /></svg>
);

/** A screen on a stand: online. */
export const GlyphScreen = (p: P) => (
  <svg {...base} {...p}><rect x="3.2" y="4" width="17.6" height="12" rx="1.8" /><path d="M9 20h6M12 16v4" /><path d="m10.4 8 3.6 2-3.6 2z" /></svg>
);

/** Two people: in the room. */
export const GlyphPeople = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8.4" r="3.2" /><path d="M3.2 19.6a5.8 5.8 0 0 1 11.6 0" /><path d="M15.6 5.6a3.2 3.2 0 0 1 0 5.6M17.4 14.6a5.6 5.6 0 0 1 3.4 5" /></svg>
);

/** An arrow leaving a box: this link goes to another site. */
export const GlyphExternal = (p: P) => (
  <svg {...base} {...p}><path d="M14 4.5h5.5V10M19 5l-8 8" /><path d="M18 14v4.6a1.9 1.9 0 0 1-1.9 1.9H5.4a1.9 1.9 0 0 1-1.9-1.9V7.9A1.9 1.9 0 0 1 5.4 6H10" /></svg>
);
