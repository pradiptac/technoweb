/**
 * What sits behind the sign-in, registration and password screens — three
 * settings, one list each, in the `login` group.
 *
 * Plain data with no client imports, so the settings picker and the auth
 * layout can both read it. The API checks only the *shape* of an id (the
 * motion rule, for the motion reason: a second copy of the list on the far
 * side of the wire is the `admin_path` drift), and `loginBackdropFor()`
 * falls back per field to the first entry for anything it does not know.
 *
 * **The first entry of every list is the default and is the screen as it
 * was before the group existed**: the sign-in image when one is uploaded,
 * the brand gradient and grid when none is. An install that never opens
 * the tab changes nothing on deploy.
 *
 * Every animation is drawn by `components/layout/auth-backdrop.tsx` in the
 * theme's own brand, secondary and accent hues, read from the CSS tokens at
 * mount — so a palette change reaches the sign-in screen without a second
 * list of colours here. Under `prefers-reduced-motion` each one draws a
 * single frame and stops.
 */
export type LoginChoice = { id: string; label: string; note: string };

export type LoginBackdropId =
  | "image" | "particles" | "waves" | "circuit" | "geometric"
  | "dataflow" | "gradient" | "quantum" | "stars";

export const BACKDROPS: (LoginChoice & { id: LoginBackdropId })[] = [
  { id: "image", label: "Picture", note: "The sign-in image below, or the brand gradient when none is set. The screen as it has always been." },
  { id: "particles", label: "Particles", note: "Floating dots, joined by a line while they are near one another." },
  { id: "waves", label: "Waves", note: "Three slow wave layers rolling across the lower half." },
  { id: "circuit", label: "Circuit", note: "Traces on a grid, with pulses travelling along them." },
  { id: "geometric", label: "Geometric", note: "Wireframe shapes drifting and turning." },
  { id: "dataflow", label: "Data flow", note: "Streams of light running down the panel." },
  { id: "gradient", label: "Gradient", note: "Three washes of the theme's colours, drifting into one another." },
  { id: "quantum", label: "Quantum", note: "Points orbiting field centres, with rings that breathe." },
  { id: "stars", label: "Stars", note: "A starfield with depth, drifting slowly and twinkling." },
];

export type LoginIntensityId = "low" | "medium" | "high";

export const INTENSITIES: (LoginChoice & { id: LoginIntensityId })[] = [
  { id: "medium", label: "Medium", note: "The default density." },
  { id: "low", label: "Low", note: "About half as much on screen. Calmer, and lighter on an older laptop." },
  { id: "high", label: "High", note: "Nearly twice as much. Busy, and deliberately so." },
];

export type LoginSpeedId = "slow" | "normal" | "fast";

export const SPEEDS: (LoginChoice & { id: LoginSpeedId })[] = [
  { id: "normal", label: "Normal", note: "The default pace." },
  { id: "slow", label: "Slow", note: "Half speed. Reads as ambient rather than as movement." },
  { id: "fast", label: "Fast", note: "Nearly double. Noticeable from across the room." },
];

/** The multipliers each choice stands for. Intensity scales counts and alpha; speed scales time. */
export const INTENSITY_FACTOR: Record<LoginIntensityId, number> = { low: 0.5, medium: 1, high: 1.8 };
export const SPEED_FACTOR: Record<LoginSpeedId, number> = { slow: 0.5, normal: 1, fast: 1.8 };

export type LoginBackdrop = {
  backdrop: LoginBackdropId;
  intensity: LoginIntensityId;
  speed: LoginSpeedId;
};

const pick = <T extends string>(list: { id: T }[], id: string | undefined): T =>
  list.some((c) => c.id === id) ? (id as T) : list[0].id;

/** The three choices, each resolved with its default for an unknown or absent id. */
export function loginBackdropFor(settings: Record<string, string | undefined>): LoginBackdrop {
  return {
    backdrop: pick(BACKDROPS, settings.login_backdrop),
    intensity: pick(INTENSITIES, settings.login_intensity),
    speed: pick(SPEEDS, settings.login_speed),
  };
}
