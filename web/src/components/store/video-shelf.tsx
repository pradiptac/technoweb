import { Container } from "@/components/ui/container";
import { VideoShelfTiles } from "@/components/store/video-shelf-tiles";
import type { VideoShelfConfig } from "@/lib/store-videos";
import { cn } from "@/lib/utils";
import type { VideoShelfRow } from "@/types/store-merch";

/**
 * "Shop the videos" (0.140.0): a heading, a line under it and a row of video
 * tiles with the product under each — the server half of the shelf; the tiles
 * are a client island (`video-shelf-tiles.tsx`) because playing, one at a
 * time, pausing and the arrows are all state.
 *
 * **A shelf with nothing to show draws nothing at all** — no heading, no
 * section, no padding — which is what lets the shop front, a product page and
 * the homepage carry it unconditionally and an install with no product videos
 * look exactly as it did. The rows are `VideoShelf`'s on the API (`GET
 * /store/videos`), so every placement agrees about which videos exist.
 *
 * `size="small"` is the product page's: narrower tiles and no lede, a "Watch"
 * row beside the reading rather than a band of its own. Rendered by a server
 * component with no request-time API in it, so the ISR-cached product page
 * can carry it; whether autoplay is allowed is decided in the browser.
 */
export function VideoShelf({
  rows, config, heading, lede, size = "large", contained = true, headingId, className,
}: {
  rows: VideoShelfRow[];
  config: VideoShelfConfig;
  /** Overrides the setting's heading, e.g. "Watch" on a product page. */
  heading?: string;
  lede?: string;
  size?: "large" | "small";
  /** Wrap in the page's `Container`; off where the caller already is inside one. */
  contained?: boolean;
  headingId?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  const title = heading ?? config.heading;
  const line = size === "small" ? "" : (lede ?? config.lede);
  const id = headingId ?? (size === "small" ? "watch-videos" : "shop-videos");

  /*
    The heading is handed to the tiles as an element, so it shares one row
    with the arrows and the Pause button. Drawn above them it left the
    controls a line of their own — 80px of nothing between the heading and
    the videos at 1280 (found by eye, 0.140.0). A server component may pass
    JSX to a client one; React serialises the markup, not the component.
  */
  const body = (
    <VideoShelfTiles
      rows={rows}
      shape={config.shape}
      autoplay={config.autoplay}
      showSku={config.showSku}
      consentGated={config.consentGated}
      size={size}
      header={
        // Keyed: an element that crosses from a server component arrives
        // unvalidated, and React warns about a missing key the moment the
        // client places it beside a sibling.
        <div key="head" className="min-w-0">
          <h2 id={id} className={size === "small" ? "text-18 font-semibold" : "text-22 font-semibold tracking-tight"}>
            {title}
          </h2>
          {line && <p className="measure mt-1 text-14 text-muted">{line}</p>}
        </div>
      }
    />
  );

  return (
    <section aria-labelledby={id} data-video-shelf className={cn(className)}>
      {contained ? <Container>{body}</Container> : body}
    </section>
  );
}
