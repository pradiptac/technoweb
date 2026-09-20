import type { ThemeManifest } from "../contract.ts";

/**
 * Terminal: the site as a command line.
 *
 * The third of the technology-company themes (2026-09-17): the CLI
 * identity. JetBrains Mono for every heading, label and button, hairline
 * borders, no radius and no shadow anywhere, the page's own ink on the
 * page's own ground with the palette's brand as the one colour. The header
 * is one row with the sections as paths (`/solutions`), and under it a
 * permanent **ticker** — the homepage statistics and the phone number in
 * mono, scrolling — reusing the brand marquee's CSS and its pause button.
 * The front page opens on a terminal window: a prompt, the kicker as a
 * comment, the headline typed out, two bracketed buttons; beside it a
 * second window holds the slider or the NOC panel. The solutions are a
 * **table** (`ls solutions/`) where the other themes draw cards. Every
 * inner page opens on a prompt line and a `#` heading; the closing band is
 * a bordered box with a command in it.
 */
export const terminalManifest: ThemeManifest = {
  id: "terminal",
  name: "Terminal",
  blurb: "A command line: monospace headings, hairlines and square corners, a status ticker under the header, a prompt-styled front page, tables where the others use cards.",
  screenshot: "/themes/terminal.jpg",
  // Every page opens on the prompt line; the section banner is never drawn.
  ignores: ["hero_style"],
  defaults: { menu_style: "simple" },
};
