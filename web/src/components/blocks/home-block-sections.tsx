import { VideoShelf } from "@/components/store/video-shelf";
import type { VideoShelfConfig } from "@/lib/store-videos";
import type { ContentBlock } from "@/types/api";
import type { VideoShelfRow } from "@/types/store-merch";
import { BlockView } from "./block-view";

/**
 * The blocks the homepage can carry, chosen in Site → Settings → Homepage — and,
 * since 0.140.0, the shop's "shop the videos" row, switched on in Store →
 * Product videos.
 *
 * `videos` is the tiles with the shelf's configuration, or null: the switch is
 * off, no product has a video, or the read failed. It rides with the blocks
 * because it is the same kind of thing — an optional section every theme
 * spreads in — and that is what gave all twelve themes the row without one of
 * their templates changing.
 */
export type HomeBlocks = {
  stats: ContentBlock | null;
  pricing: ContentBlock | null;
  stack: ContentBlock | null;
  videos?: { rows: VideoShelfRow[]; config: VideoShelfConfig } | null;
};

/**
 * The homepage's block sections — a stat bar, a pricing table, a technology
 * stack, the product videos — as `SECTIONS` entries every theme spreads into
 * its list.
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
  if (blocks.videos && blocks.videos.rows.length > 0) {
    out.push({
      id: "videos",
      node: <VideoShelf rows={blocks.videos.rows} config={blocks.videos.config} className="section-y" />,
    });
  }
  return out;
}
