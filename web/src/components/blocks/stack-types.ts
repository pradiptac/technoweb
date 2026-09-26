/**
 * The shapes the stack block's client islands are handed. Plain data only:
 * everything drawn — a logo, an identity icon, a detail card — arrives as an
 * already-rendered element from `stack-block.tsx`, so no island imports the
 * icon map (CLAUDE.md, "Bundles").
 */

/** One ring of the orbit: its speed, its direction, and which nodes ride it (indices into `nodes`). */
export type OrbitRing = { speed: number; direction: "cw" | "ccw"; nodes: number[] };

/** One technology as the orbit needs it: a key, the label its button is named by, and its own colour (a validated hex, or null). */
export type OrbitNode = { key: string; label: string; colour: string | null };
