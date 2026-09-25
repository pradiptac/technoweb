import type { ContentBlock } from "@/types/api";
import { CtaBlock } from "./cta-block";
import { StatsBlock } from "./stats-block";
import { PricingBlock } from "./pricing-block";
import { StackBlock } from "./stack-block";

/**
 * One content block, whatever its type — the shortcode renderer, the
 * homepage sections and the console's showcase all draw through here, so a
 * type added later is honoured everywhere at once (the `SliderFor` rule).
 *
 * `embedded` is a block inside an article body: no `Container`, no section
 * padding, a margin instead. Without it the block is a page section.
 */
export function BlockView({ block, embedded = false }: { block: ContentBlock; embedded?: boolean }) {
  switch (block.type) {
    case "cta":
      return <CtaBlock block={block} embedded={embedded} />;
    case "stats":
      return <StatsBlock block={block} embedded={embedded} />;
    case "pricing":
      return <PricingBlock block={block} embedded={embedded} />;
    case "stack":
      return <StackBlock block={block} embedded={embedded} />;
    default:
      return null;
  }
}
