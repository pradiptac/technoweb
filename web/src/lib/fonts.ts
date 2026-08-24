import localFont from "next/font/local";

/**
 * Fonts are self-hosted (files vendored from @fontsource into src/fonts) rather
 * than fetched from Google. That means no third-party request at runtime, no
 * build-time network dependency, and no consent question about Google Fonts.
 */

export const inter = localFont({
  src: [{ path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/*
 * Two weights, not three.
 *
 * Measured across all 16 public routes and 7 console screens: 600 on 330
 * elements, 700 on 116, and 500 on exactly **one** — the homepage pull-quote,
 * which now renders at 600. A 17KB font file fetched on every page for a
 * single blockquote is the clearest kind of waste there is.
 *
 * If a 500 is wanted again, add the file back rather than relying on the
 * fallback: CSS font matching would quietly resolve `font-medium` to the 600
 * face, so it would look like the weight worked and ship nothing.
 */
export const instrument = localFont({
  src: [
    { path: "../fonts/instrument-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/instrument-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const jetbrains = localFont({
  src: [{ path: "../fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
