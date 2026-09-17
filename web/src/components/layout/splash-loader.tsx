/**
 * What the first-visit splash shows: a loader drawn in the theme's idiom,
 * not the logo.
 *
 * The splash used to settle the logo in over the page colour, and the
 * client's verdict was that the logo is not a good loader (2026-09-18) —
 * it reads as a page that has stalled on its own header rather than as a
 * page arriving. Each theme now has a small animated mark of its own,
 * chosen by id, and the logo is left to the header where it belongs:
 *
 * - classic    `orbit`  — three dots in the brand, secondary and accent
 *                         hues circling a point.
 * - editorial  `rules`  — three typographic rules drawing in from the
 *                         centre in turn, in ink.
 * - datacenter `rack`   — four LED bars lighting top to bottom, a rack
 *                         coming up.
 * - launch     `pill`   — a brand slug sliding along a rounded track.
 * - terminal   `cursor` — a prompt and a blinking block cursor, in mono.
 * - summit     `peak`   — a mountain line stroking itself in, and the sun
 *                         behind it.
 * - enterprise `bars`   — four bars rising in sequence, a chart filling.
 * - horizon    `arc`    — a ring in the three hues, sweeping.
 * - canvas     `dots`   — three coral dots on a wave.
 *
 * Markup only; every animation is CSS in globals.css under
 * `html[data-splash] .splash [data-loader]`, inside the reduced-motion
 * guard with the rest of the splash, and keyed on the theme's tokens so a
 * palette change reaches the loader. `aria-hidden` through the splash
 * itself; the terminal's prompt is the one loader carrying text, and it is
 * decoration a screen reader is already told to skip.
 */
export type SplashLoaderId = "orbit" | "rules" | "rack" | "pill" | "cursor" | "peak" | "bars" | "arc" | "dots";

const LOADER_BY_THEME: Record<string, SplashLoaderId> = {
  classic: "orbit",
  editorial: "rules",
  datacenter: "rack",
  launch: "pill",
  terminal: "cursor",
  summit: "peak",
  enterprise: "bars",
  horizon: "arc",
  canvas: "dots",
};

export function splashLoaderFor(themeId: string): SplashLoaderId {
  return LOADER_BY_THEME[themeId] ?? "orbit";
}

export function SplashLoader({ theme }: { theme: string }) {
  const id = splashLoaderFor(theme);
  return (
    <div className="splash-loader" data-loader={id}>
      {id === "peak" ? (
        <svg viewBox="0 0 96 64" width="96" height="64" fill="none" aria-hidden>
          <circle className="peak-sun" cx="66" cy="22" r="9" />
          <path className="peak-line" d="M4 58 L30 22 L44 40 L58 12 L92 58" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : id === "cursor" ? (
        <span className="cursor-line"><span className="cursor-prompt">$</span> <span className="cursor-block" /></span>
      ) : (
        <>
          <span className="splash-loader__unit" />
          <span className="splash-loader__unit" />
          <span className="splash-loader__unit" />
          {(id === "rack" || id === "bars") && <span className="splash-loader__unit" />}
        </>
      )}
    </div>
  );
}
