import type { ThemeManifest } from "../contract.ts";
import { oneRowHeader } from "../chrome-parts.ts";

/**
 * Vantage: the IT-services agency's site, after technerd.altisinfonet.in.
 *
 * The eleventh theme (2026-09-18). What the client named in the reference:
 * "a transparent menu on a full-width new-style slider" — a floating pill
 * header that is see-through over the hero photograph and turns solid the
 * moment the page scrolls or the page has no dark band to sit on, and a
 * hero that is the slider itself, full-bleed to both edges, with the
 * slide's own words and a white notch in the corner holding the counter
 * and the arrows. Under it: the solutions as photograph cards, a split
 * "about" with the statistics, the customer's words on a panel over a
 * darkened photograph, and the contact-plates footer. Plus Jakarta Sans
 * for the display, Public Sans for the body; the accent ramp carries the
 * reference's cyan. Two Freepik photographs under `public/themes/vantage/`.
 */
export const vantageManifest: ThemeManifest = {
  id: "vantage",
  name: "Vantage",
  blurb: "An IT-services agency: a see-through pill menu over a full-bleed slider hero with a corner notch, photograph cards, the accent everywhere.",
  screenshot: "/themes/vantage.jpg",
  // Every inner page opens on the dark photograph band the header sits over.
  ignores: ["hero_style"],
  defaults: { menu_style: "semi" },
  chrome: { header: oneRowHeader(["utility", "search", "phone", "cta"]), footer: { parts: ["tagline", "address", "phone", "social", "columns", "signup", "legal", "credit", "scheme"] } },
};
