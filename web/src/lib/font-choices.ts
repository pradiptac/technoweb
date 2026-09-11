/**
 * The faces an editor may choose, by id.
 *
 * Plain data, no `next/font` import, so the settings picker — a client
 * component — can list them without dragging nine `localFont` declarations
 * into its bundle. Every entry is a family already vendored in
 * `web/src/fonts` and declared in `lib/fonts.ts`; the `variable` here is the
 * one that declaration binds. Adding a face means vendoring it there first,
 * because nothing is fetched from Google at runtime (CSP, no third-party
 * request, no consent question).
 *
 * **Instrument Sans is display-only.** It ships as 600 and 700 alone — a
 * body set in it would render every paragraph semibold, and CSS font
 * matching would do so without complaint. JetBrains Mono is the data face
 * and is not offered for either role.
 *
 * The setting stores an id and the API validates only its *shape*; an id
 * this list does not know falls back to the default face rather than to no
 * face. That is what keeps this the single list, with nothing on the far side
 * of the wire to keep in step.
 */
export type FontChoice = {
  id: string;
  label: string;
  variable: string;
  /** Which slots it may fill. */
  display: boolean;
  body: boolean;
  /** One line for the picker. */
  note: string;
};

export const FONT_CHOICES: FontChoice[] = [
  { id: "instrument", label: "Instrument Sans", variable: "--font-instrument", display: true, body: false, note: "The current headline face. Compact, a little technical." },
  { id: "inter", label: "Inter", variable: "--font-inter", display: true, body: true, note: "The current body face. Neutral and very legible small." },
  { id: "inter-tight", label: "Inter Tight", variable: "--font-inter-tight", display: true, body: true, note: "Inter with the letters closed up — headlines that sit tight." },
  { id: "sora", label: "Sora", variable: "--font-sora", display: true, body: true, note: "Geometric and open. Reads as a product company." },
  { id: "manrope", label: "Manrope", variable: "--font-manrope", display: true, body: true, note: "Rounded and calm. Softer than Inter." },
  { id: "space-grotesk", label: "Space Grotesk", variable: "--font-space-grotesk", display: true, body: true, note: "Quirky joins. Distinctive in headlines, busy in paragraphs." },
  { id: "ibm-plex", label: "IBM Plex Sans", variable: "--font-ibm-plex", display: true, body: true, note: "Engineered and even. The most corporate of the set." },
  { id: "fraunces", label: "Fraunces", variable: "--font-fraunces", display: true, body: true, note: "A soft serif. Warm headlines; editorial as a body." },
];

export const DEFAULT_DISPLAY_FONT = "instrument";
export const DEFAULT_BODY_FONT = "inter";
export const MONO_FONT = { variable: "--font-jetbrains", label: "JetBrains Mono" };

/** The face for a role, falling back to the role's default for an unknown or unsuitable id. */
export function fontFor(id: string | null | undefined, role: "display" | "body"): { variable: string; label: string } {
  const choice = FONT_CHOICES.find((f) => f.id === id && f[role]);
  const fallback = FONT_CHOICES.find((f) => f.id === (role === "display" ? DEFAULT_DISPLAY_FONT : DEFAULT_BODY_FONT))!;
  const f = choice ?? fallback;
  return { variable: f.variable, label: f.label };
}
