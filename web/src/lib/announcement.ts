// Relative with the extension, like the three palette modules: `theme-contrast.mjs`
// and the announcement probe import this under Node's --experimental-strip-types.
import { announcementBand } from "./palette.ts";
import type { SiteSettings } from "./site-settings.ts";

/*
 * No "use client" directive, on purpose: `announcementFor` is read by the
 * marketing layout (a server component), the root layout's blocking script
 * and the console's preview (a client component). A value imported across
 * the client boundary from a client module arrives as a reference, not a
 * value — the `lib/compare-max.ts` lesson.
 */

export type Announcement = {
  /** A fingerprint of what is shown; the closed-state key, so a changed announcement reappears. */
  id: string;
  /** Sanitised on write by the API's `inline` purifier profile. */
  html: string;
  mode: "fixed" | "ticker";
  closable: boolean;
  /** The stops as they will paint — one for solid, two for a gradient — after `announcementBand()`. */
  stops: string[];
  ink: string;
  muted: string;
  /** What was typed, for the console's "adjusted to …" note. */
  typed: string[];
};

/** Where the closed fingerprint lives for the session; read by the root layout's pre-paint script too. */
export const ANNOUNCEMENT_KEY = "tw_announcement_closed";

/** The seeded colours, and what a field falls back to on a bad value — the theme's per-field rule. */
export const ANNOUNCEMENT_DEFAULTS = { colour: "#12140d", colour2: "#2f3a1f" } as const;

const isHex = (v: string | undefined): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * The bar as the settings describe it, or null when there is nothing to show.
 *
 * `announcement_live` is the API's word — the switch, the window and the
 * message combined on the server against its clock — so this never reads a
 * date. A blank message is null too, and a colour that is not a hex falls
 * back per field rather than blanking the bar.
 */
export function announcementFor(settings: SiteSettings): Announcement | null {
  if (settings.announcement_live !== "1") return null;
  const html = (settings.announcement_message ?? "").trim();
  if (!html) return null;

  const c1 = isHex(settings.announcement_colour) ? settings.announcement_colour.toLowerCase() : ANNOUNCEMENT_DEFAULTS.colour;
  const c2 = isHex(settings.announcement_colour_2) ? settings.announcement_colour_2.toLowerCase() : ANNOUNCEMENT_DEFAULTS.colour2;
  const typed = settings.announcement_style === "gradient" ? [c1, c2] : [c1];
  const band = announcementBand(typed);
  const mode = settings.announcement_mode === "ticker" ? "ticker" : "fixed";

  return {
    id: fingerprint(`${html}|${mode}|${typed.join(",")}`),
    html,
    mode,
    closable: settings.announcement_closable !== "0",
    stops: band.stops,
    ink: band.ink,
    muted: band.muted,
    typed,
  };
}

/** djb2, base36 — short, stable, safe inside a script literal and a data attribute. */
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
