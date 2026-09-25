import type { ContentBlock } from "@/types/api";
import { BlockView } from "./block-view";

/** The three blocks the homepage can carry, chosen in Site → Settings → Homepage. */
export type HomeBlocks = { stats: ContentBlock | null; pricing: ContentBlock | null; stack: ContentBlock | null };

/**
 * The homepage's block sections — a stat bar, a pricing table, a technology
 * stack — as `SECTIONS` entries every theme spreads into its list.
 *
 * **Only the chosen ones are returned.** An entry with nothing in it would
 * still get its `HomeSection` shell, and with a background set on the Themes
 * screen that is an empty coloured band; leaving the entry out is what makes
 * "none chosen" draw nothing at all. The ids are the Themes screen's
 * contract (`HOME_SECTIONS`), so where they sit and whether they show is
 * decided there like every other section.
 */
export function homeBlockSections(blocks: HomeBlocks): { id: string; node: React.ReactNode }[] {
  const out: { id: string; node: React.ReactNode }[] = [];
  if (blocks.stats) out.push({ id: "stats_block", node: <BlockView block={blocks.stats} /> });
  if (blocks.stack) out.push({ id: "stack", node: <BlockView block={blocks.stack} /> });
  if (blocks.pricing) out.push({ id: "pricing", node: <BlockView block={blocks.pricing} /> });
  return out;
}
