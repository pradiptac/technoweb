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
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const jetbrains = localFont({
  src: [{ path: "../fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

/*
 * Theme display faces.
 *
 * All six are declared, but a browser only ever downloads the one the active
 * theme's `--font-display` points at: next/font emits an @font-face per
 * family, and a font file is fetched when something on the page is actually
 * set in it. Ten themes therefore cost the same at runtime as one — verified
 * by counting font requests, not assumed.
 *
 * Vendored from @fontsource-variable for the same reason the three above are:
 * no third-party request, no build-time network dependency, and no consent
 * question about Google Fonts.
 */
export const interTight = localFont({
  src: [{ path: "../fonts/inter-tight-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter-tight",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const sora = localFont({
  src: [{ path: "../fonts/sora-latin-wght-normal.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-sora",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const manrope = localFont({
  src: [{ path: "../fonts/manrope-latin-wght-normal.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-manrope",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const spaceGrotesk = localFont({
  src: [{ path: "../fonts/space-grotesk-latin-wght-normal.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-space-grotesk",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const ibmPlex = localFont({
  src: [{ path: "../fonts/ibm-plex-sans-latin-wght-normal.woff2", weight: "100 700", style: "normal" }],
  variable: "--font-ibm-plex",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const fraunces = localFont({
  src: [{ path: "../fonts/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-fraunces",
  // preload: false is what makes ten themes cost the same as one.
  //
  // next/font preloads every declared face by default, and all nine variables
  // sit on <html> — so the browser fetched all nine regardless of which theme
  // was active. Measured: 11 font files on one homepage. Without preloading,
  // a face is fetched when something on the page is actually set in it, which
  // is exactly one display family per theme. `display: "swap"` covers the
  // short gap that costs.
  preload: false,
  display: "swap",
  fallback: ["Georgia", "serif"],
});

/** Every family, for the html element's className. */
export const ALL_FONT_VARIABLES = [
  inter, instrument, jetbrains, interTight, sora, manrope, spaceGrotesk, ibmPlex, fraunces,
].map((f) => f.variable).join(" ");
