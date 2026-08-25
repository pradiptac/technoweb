/**
 * One fluorescent hue per thing, chosen from what the thing is.
 *
 * Used in two places for the same reason — so a row or a card is recognisable
 * before it is read:
 *
 * - the console's nav, seeded on each destination's href
 * - identity icons on the public site, seeded on the icon's name in `iconMap`
 *
 * **Deterministic, never `Math.random()`.** A colour drawn at render time
 * differs between the server and the client — a hydration mismatch — and
 * reshuffles on every navigation, which defeats the only thing the colour is
 * for. Hashing a stable seed gives a stable hue.
 *
 * ### Adding an icon later
 *
 * Nothing to do. An identity icon is one registered in `iconMap`, and it takes
 * its hue from its own key, so a new entry is coloured the moment it exists.
 * The hues are a fixed set of twelve rather than a value computed per name,
 * because a generated colour cannot be checked for contrast in advance and
 * these are: see `scripts/neon-contrast.mjs`, which derives every value and is
 * the thing to re-run if the palette or the surfaces change.
 *
 * ### What must *not* take a hue
 *
 * Anything rendered directly — `IconArrowRight`, `IconChevronDown`,
 * `IconCheck`, `IconMenu`, `IconClose`, the social marks. Those sit inside a
 * button or a line of text and have to inherit `currentColor`: an arrow in a
 * white-on-brand button turning lime is not decoration, it is a defect. The
 * split is enforced by which path renders them — `IdentityIcon` colours, a
 * direct `<IconX />` does not.
 */

/** How many hues exist. Keep in step with `--color-neon-*` in globals.css. */
export const HUE_COUNT = 12;

export function hueFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;

  return `var(--color-neon-${(hash % HUE_COUNT) + 1})`;
}
