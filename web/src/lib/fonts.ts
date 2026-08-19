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

export const instrument = localFont({
  src: [
    { path: "../fonts/instrument-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
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
