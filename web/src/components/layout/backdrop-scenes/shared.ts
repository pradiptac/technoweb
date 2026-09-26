/**
 * What every sign-in backdrop scene shares — the colour type, the palette
 * the loop reads from the tokens, the scene contract, and the two helpers.
 *
 * A scene is a factory: given the panel's size, the intensity factor and the
 * palette, it returns a `draw(ctx, t, input)` the loop in `auth-backdrop.tsx`
 * calls every frame (or once, for a still frame). `t` is seconds already
 * scaled by the speed choice; `input.pointer` is where the pointer is over
 * the panel, in CSS pixels, or null — only the wave grid reads it.
 */
export type Rgb = [number, number, number];
export type Palette = { brand: Rgb; secondary: Rgb; accent: Rgb };
export type SceneInput = { pointer: { x: number; y: number } | null };
export type Scene = { draw: (ctx: CanvasRenderingContext2D, t: number, input: SceneInput) => void };
export type SceneFactory = (w: number, h: number, density: number, p: Palette) => Scene;

export const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;

/** A deterministic pseudo-random sequence, so a still frame is the same frame every time. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
