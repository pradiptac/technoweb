"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { OrbitNode, OrbitRing } from "./stack-types";

/**
 * Ring radii as a percentage of the stage's width, by how many rings there
 * are. The outer ring stops at 41.5% so a 36px node on it (half of it past
 * the ring) still clears the edge of a 288px stage — the Container at 320px.
 */
const RADII: Record<number, number[]> = {
  1: [38],
  2: [26, 41],
  3: [19.5, 30.5, 41.5],
};

/** Keeps the inline percentages identical between the server's render and the client's. */
const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

/**
 * The orbit layout's moving part: rings of technologies turning about the
 * centre logo, after vengenceui.com's solar system.
 *
 * The motion is CSS (`.stack-orbit` in `blocks.css`): each ring turns on the
 * `rotate` property and each node turns the other way at the same rate, so a
 * logo stays upright while its ring carries it round. All of it sits inside
 * `prefers-reduced-motion: no-preference`, so a reader who asked for less
 * motion gets still rings and nothing else changes. Hover and focus pause
 * it; the Pause button (`MarqueeToggle`, drawn by the server beside this)
 * flips `data-paused` on the `[data-marquee]` host around the stage.
 *
 * The only state here is which technology is picked. The detail cards are
 * rendered by the server — `details[i]` for `nodes[i]` — and this shows one
 * of them, inside an `aria-live` region, so a pick is announced.
 */
export function StackOrbit({
  rings, nodes, marks, details, centre, pauseControl,
}: {
  rings: OrbitRing[];
  nodes: OrbitNode[];
  /** The logo or icon for each node, rendered on the server. */
  marks: ReactNode[];
  /** The detail card for each node, rendered on the server. */
  details: ReactNode[];
  /** What sits in the middle disc. */
  centre: ReactNode;
  /** The pause toggle, rendered by the server inside the host. */
  pauseControl: ReactNode;
}) {
  const [selected, setSelected] = useState(0);
  const radii = RADII[rings.length] ?? RADII[3];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-12">
      <div data-marquee className="relative mx-auto w-full max-w-[560px] pb-9 sm:pb-0">
        <div className="stack-orbit">
          {rings.map((ring, r) => {
            const radius = radii[r] ?? radii[radii.length - 1];
            const count = ring.nodes.length;
            const ringStyle = {
              "--orbit-speed": `${ring.speed}s`,
              "--orbit-dir": ring.direction === "ccw" ? "reverse" : "normal",
              "--orbit-counter": ring.direction === "ccw" ? "normal" : "reverse",
            } as CSSProperties;
            return (
              <div key={r} className="stack-orbit__ring" style={ringStyle}>
                <span aria-hidden="true" className="stack-orbit__track" style={{ width: pct(radius * 2), height: pct(radius * 2) }} />
                {ring.nodes.map((index, k) => {
                  const node = nodes[index];
                  // Each ring starts a little further round, so three rings never line their first nodes up.
                  const angle = ((-90 + (360 / count) * k + r * 23) * Math.PI) / 180;
                  const style = {
                    left: pct(50 + radius * Math.cos(angle)),
                    top: pct(50 + radius * Math.sin(angle)),
                    ...(node.colour ? { "--node-colour": node.colour } : {}),
                  } as CSSProperties;
                  return (
                    <button
                      key={node.key}
                      type="button"
                      className="stack-orbit__node"
                      style={style}
                      aria-pressed={selected === index}
                      aria-label={node.label}
                      onClick={() => setSelected(index)}
                    >
                      {marks[index]}
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="stack-orbit__centre stack-disc stack-disc--logo">{centre}</div>
        </div>
        {pauseControl}
      </div>

      <div aria-live="polite" className="min-w-0">
        {details[selected] ?? details[0]}
      </div>
    </div>
  );
}
