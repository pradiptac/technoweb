import type { ThemeManifest } from "../contract.ts";

/**
 * Datacenter: the site as an operations floor.
 *
 * The first of the technology-company themes asked for on 2026-09-16 — a
 * network-operations aesthetic rather than a brochure: a dark header and
 * hero on a blueprint grid, monospace readouts where the classic site has
 * statistics, the NOC panel (the site's own topology drawing) as the
 * hero's picture, solutions listed like racks with codes, and an accent
 * line where a card would have a shadow. IBM Plex Sans throughout — the
 * most engineered face in the vendored set — and JetBrains Mono for every
 * figure. Everything that carries the brand's colour still comes from the
 * palette; the theme decides where the dark bands are.
 */
export const datacenterManifest: ThemeManifest = {
  id: "datacenter",
  name: "Datacenter",
  blurb: "An operations floor: dark header and hero on a grid, monospace readouts, the NOC panel up front, racks instead of cards.",
  screenshot: "/themes/datacenter.jpg",
};
