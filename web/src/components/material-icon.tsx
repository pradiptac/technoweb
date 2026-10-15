import type { CSSProperties } from "react";

/**
 * A Google icon (Material Symbols Rounded, Apache-2.0), drawn from our own
 * `/icons/material/<name>.svg` — never from Google (0.179.0, docs/icons.md).
 *
 * Its own module, no directive and no import of `icons.tsx`: a client component
 * that imports from `icons.tsx` ships the whole ~130-icon map (the Turbopack
 * rule `CLAUDE.md` records), and the page editor and the picker's grid both
 * need only this. `icons.tsx` re-exports it, so server code keeps one path.
 *
 * The path in the file carries no fill, so it takes `currentColor` from this
 * element. A name that is not in the set is a 404 for that file and draws
 * nothing, the way an `iconMap` key this build does not have does.
 */
export function MaterialIcon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor" aria-hidden="true" className={className} style={style}>
      <use href={`/icons/material/${name}.svg#i`} />
    </svg>
  );
}
