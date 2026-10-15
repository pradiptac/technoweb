/**
 * The transform that zooms the support map to a country's box, padded — one
 * function for the server's first paint and the island's chips
 * (docs/support-network.md). No directive: both sides import it.
 */
export type MapBox = [number, number, number, number];

export function zoomFor(box: MapBox | null, W: number, H: number): { s: number; transform: string } {
  if (!box) return { s: 1, transform: "none" };
  const [x, y, w, h] = box;
  const s = Math.max(1, Math.min(14, W / (w * 1.35), H / (h * 1.35)));
  return { s, transform: `translate(${W / 2}px, ${H / 2}px) scale(${s}) translate(${-(x + w / 2)}px, ${-(y + h / 2)}px)` };
}
