import type { SiteSettings } from "@/lib/site-settings";

/**
 * A company's own typefaces (0.125.0, docs/theming.md).
 *
 * Two slots, `custom-1` and `custom-2`, each a name and one or two WOFF2
 * files uploaded under Site → Settings → Colour palette. A slot's id and its
 * CSS variable are fixed, so `fontFor()` can answer for one without knowing
 * what has been uploaded, and the root layout declares the variable either
 * way — a theme still pointing at an emptied slot falls back to the default
 * face rather than to nothing.
 *
 * **Nothing an editor typed reaches the stylesheet.** The family is declared
 * under a name of ours (`tw-custom-1`), never the one typed, and the file's
 * address is built from a stored path only when it has exactly the shape the
 * API writes. The typed name is shown in the font lists and nowhere else.
 *
 * **Served from this origin** (`/font/<file>`, a route handler): a font is
 * refused cross-origin without CORS headers, the API's storage is another
 * origin, and `php artisan serve` sends none.
 *
 * No directive: the root layout and the settings picker both import this.
 */
export type CustomFont = {
  id: "custom-1" | "custom-2";
  slot: 1 | 2;
  /** The name somebody typed — for the font lists only. */
  name: string;
  variable: string;
  regular: string;
  bold: string | null;
  /** One file holding every weight. */
  isVariable: boolean;
};

export const CUSTOM_FONT_SLOTS = [1, 2] as const;

const STORED = /^fonts\/([A-Za-z0-9]{40}\.woff2)$/;

/** `/font/<file>` for a stored path, or null when the value is not one the API wrote. */
export function fontHref(path: string | null | undefined): string | null {
  const match = STORED.exec(path ?? "");
  return match ? `/font/${match[1]}` : null;
}

/** The CSS variable a custom font id resolves through, or null for any other id. */
export function customFontVariable(id: string | null | undefined): string | null {
  return id === "custom-1" || id === "custom-2" ? `--font-${id}` : null;
}

/** The slots that hold a font, in order. */
export function customFontsFor(settings: SiteSettings): CustomFont[] {
  const fonts: CustomFont[] = [];

  for (const slot of CUSTOM_FONT_SLOTS) {
    const regular = fontHref(settings[`custom_font_${slot}_regular`]);
    if (!regular) continue;

    fonts.push({
      id: `custom-${slot}`,
      slot,
      name: settings[`custom_font_${slot}_name`]?.trim() || `Your font ${slot}`,
      variable: `--font-custom-${slot}`,
      regular,
      bold: fontHref(settings[`custom_font_${slot}_bold`]),
      isVariable: settings[`custom_font_${slot}_variable`] === "1" || settings[`custom_font_${slot}_variable`] === "true",
    });
  }

  return fonts;
}

/**
 * The stylesheet for the custom fonts: an `@font-face` per file and the two
 * variables. An empty slot's variable is the default body face, so
 * `var(--font-custom-2)` is never an invalid value.
 *
 * Weights: a variable font declares its whole range. A static regular is
 * declared at 400 and a bold at 700 — the site sets its headings at 600 and
 * 700, and CSS font matching sends both to the 700 face. With no bold file
 * the browser thickens the regular one itself, which is what a single static
 * file can offer.
 */
export function customFontsCss(fonts: CustomFont[]): string {
  const face = (slot: number, href: string, weight: string) =>
    `@font-face{font-family:"tw-custom-${slot}";src:url(${href}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;

  const faces = fonts.flatMap((f) => [
    face(f.slot, f.regular, f.isVariable ? "100 900" : "400"),
    ...(f.bold && !f.isVariable ? [face(f.slot, f.bold, "700")] : []),
  ]);

  const variables = CUSTOM_FONT_SLOTS.map((slot) => {
    const filled = fonts.some((f) => f.slot === slot);
    return `--font-custom-${slot}:${filled ? `"tw-custom-${slot}",ui-sans-serif,system-ui,sans-serif` : "var(--font-inter)"}`;
  });

  return `${faces.join("")}:root{${variables.join(";")}}`;
}

/** Whether the stylesheet above is needed at all: a font is uploaded, or the site is set in a custom slot. */
export function usesCustomFonts(settings: SiteSettings): boolean {
  return customFontsFor(settings).length > 0
    || customFontVariable(settings.theme_font_display) !== null
    || customFontVariable(settings.theme_font_body) !== null;
}

/** The files to preload: the faces the site is actually set in, bold for headings and regular for body. */
export function customFontPreloads(settings: SiteSettings): string[] {
  const fonts = customFontsFor(settings);
  const hrefs = new Set<string>();

  const display = fonts.find((f) => f.id === settings.theme_font_display);
  if (display) hrefs.add(display.isVariable ? display.regular : display.bold ?? display.regular);

  const body = fonts.find((f) => f.id === settings.theme_font_body);
  if (body) hrefs.add(body.regular);

  return [...hrefs];
}
