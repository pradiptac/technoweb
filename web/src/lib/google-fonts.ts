import type { SiteSettings } from "@/lib/site-settings";

/**
 * Google fonts copied to this server (0.179.0, docs/theming.md).
 *
 * The API publishes every installed font as the `google_fonts` setting; this
 * turns it into `@font-face` rules under a family name of ours, each face
 * with the `unicode-range` Google gave it — so a Hindi page downloads the
 * Devanagari file and an English page does not.
 *
 * **Nothing typed reaches the stylesheet.** The family is declared as
 * `tw-g-<slug>`, never under the name Google uses; a file's address is built
 * only from a stored path of exactly the shape the API writes, and only when
 * it belongs to the slug it sits under; a range is held to the characters a
 * `unicode-range` is made of. Files are served same-origin by
 * `/font/g/<slug>/<n>.woff2`, so a visitor's browser never contacts Google.
 *
 * No directive: the root layout and the settings picker both import this.
 */
export type GoogleFontRow = {
  id: string;
  slug: string;
  /** The name Google gives it — for the font lists only. */
  family: string;
  category: string;
  faces: { weight: number; range: string; href: string }[];
};

const PATH = /^fonts\/google\/([a-z0-9-]{1,62})\/(\d{1,3})\.woff2$/;
const RANGE = /^[U+0-9A-Fa-f,\s?-]{1,4000}$/;
const SLUG = /^[a-z0-9-]{1,62}$/;

/** `--font-g-<slug>` for a Google font id, or null for any other id. */
export function googleFontVariable(id: string | null | undefined): string | null {
  return id && /^g-[a-z0-9-]{1,62}$/.test(id) ? `--font-${id}` : null;
}

/** The installed Google fonts the API published, with anything malformed dropped. */
export function googleFontsFor(settings: SiteSettings): GoogleFontRow[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(settings.google_fonts ?? "[]");
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((row): GoogleFontRow[] => {
    if (!row || typeof row.slug !== "string" || !SLUG.test(row.slug)) return [];

    const faces = (Array.isArray(row.faces) ? row.faces : []).flatMap(
      (f: { weight?: unknown; range?: unknown; path?: unknown }) => {
        const m = PATH.exec(String(f?.path ?? ""));
        const weight = Number(f?.weight);
        const range = String(f?.range ?? "");

        return m && m[1] === row.slug && Number.isInteger(weight) && RANGE.test(range)
          ? [{ weight, range, href: `/font/g/${m[1]}/${m[2]}.woff2` }]
          : [];
      },
    );

    return faces.length
      ? [{ id: `g-${row.slug}`, slug: row.slug, family: String(row.family ?? row.slug), category: String(row.category ?? "sans-serif"), faces }]
      : [];
  });
}

const GENERIC: Record<string, string> = {
  serif: "ui-serif,Georgia,serif",
  monospace: "ui-monospace,monospace",
  handwriting: "cursive",
};

/** An `@font-face` per file and one `--font-g-<slug>` per family. */
export function googleFontsCss(rows: GoogleFontRow[]): string {
  const faces = rows.flatMap((r) => r.faces.map((f) =>
    `@font-face{font-family:"tw-g-${r.slug}";src:url(${f.href}) format("woff2");font-weight:${f.weight};font-style:normal;font-display:swap;unicode-range:${f.range}}`));
  const vars = rows.map((r) => `--font-g-${r.slug}:"tw-g-${r.slug}",${GENERIC[r.category] ?? "ui-sans-serif,system-ui,sans-serif"}`);

  return `${faces.join("")}${vars.length ? `:root{${vars.join(";")}}` : ""}`;
}
