import type { CSSProperties } from "react";
import { Container } from "@/components/ui/container";
import { IconTile } from "@/components/ui/icon-tile";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { FlowItem, FlowSectionData } from "@/types/api";
import { SectionFrame, SectionHead } from "./section-parts";

/**
 * A diagram (0.115.0, "Diagram" in the builder): two to six nodes in order,
 * joined by arrows — how a request travels, the stages of a rollout.
 *
 * **One row from `md`, a column below it.** The nodes share the row equally
 * (`flex-1 basis-0`), so there are never more columns than nodes, and the
 * row's width is capped by the count (16rem a node) so two nodes on a 1920
 * screen are not two islands with a 900px arrow between them. Six still fit
 * at 768: the tiles stay 44px, the titles step down a size and may break
 * anywhere rather than push the row past the page.
 *
 * **Every word is HTML.** The arrows are two spans each — a stroke and a
 * chevron drawn with borders — never an SVG with `<text>`, which the phone
 * audit measures after viewBox scaling. A connector belongs to the node it
 * points *at*: below `md` it sits in the flow above that node's tile; from
 * `md` it is absolutely placed from the previous tile's edge to this one's,
 * which is exactly one node's width because the nodes are equal.
 *
 * **They draw as the page scrolls** (`[data-flow-link]` in globals.css): each
 * stroke scales out from its start on the connector's own view timeline, the
 * row's staggered by `--i` so they draw left to right as the section rises,
 * and the chevron appears as the stroke reaches it. All of it inside the
 * reduced-motion guard and `@supports (animation-timeline: view())`, from-only
 * keyframes — anywhere else the arrows are simply drawn.
 *
 * Titles are `h3` under the section's `h2`, plain paragraphs when the section
 * has no heading — never a level skipped. The list is an `<ol>`: the order is
 * the meaning. With a caption the whole is a `<figure>`.
 */
export function FlowSection({ data, reveal }: { data: FlowSectionData; reveal?: SectionRevealAttr | null }) {
  const items = (data.items ?? []).filter((it): it is FlowItem => Boolean(it?.title)).slice(0, 6);
  if (items.length < 2) return null;

  const titled = Boolean(data.heading);
  const Title = titled ? "h3" : "p";

  return (
    <SectionFrame type="flow" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        <figure className="mx-auto" style={{ maxWidth: `${items.length * 16}rem` }}>
          <ol data-flow className="flex flex-col items-center md:flex-row md:items-start">
            {items.map((it, i) => (
              <li
                key={i}
                style={{ "--i": i } as CSSProperties}
                className="relative flex w-full min-w-0 max-w-sm flex-col items-center text-center md:max-w-none md:flex-1 md:basis-0 md:px-2"
              >
                {i > 0 && <Connector />}
                {it.icon
                  ? <IconTile name={it.icon} size="lg" />
                  : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-brand-ink/40 bg-card text-15 font-semibold tabular-nums text-brand-ink">
                      {i + 1}
                    </span>
                  )}
                <Title className="mt-4 text-17 font-semibold leading-snug text-ink md:text-15 md:[overflow-wrap:anywhere] lg:text-17">
                  {it.title}
                </Title>
                {it.note && (
                  <p className="mt-1.5 text-14-5 leading-[1.55] text-muted md:text-14 md:[overflow-wrap:anywhere] lg:text-14-5">{it.note}</p>
                )}
              </li>
            ))}
          </ol>
          {data.caption && (
            <figcaption className="mt-8 text-center text-13 text-muted">{data.caption}</figcaption>
          )}
        </figure>
      </Container>
    </SectionFrame>
  );
}

/**
 * The arrow into a node. Below `md`: a 40px column between the previous
 * node's words and this tile, the stroke
 * down its middle and the chevron at its foot. From `md`: a 10px band level
 * with the tiles' centres (the 44px tile's middle, less half the band), from
 * 30px past the previous tile's centre to 30px short of this one's — so it
 * clears both 44px tiles with 8px to spare.
 */
function Connector() {
  return (
    <span
      data-flow-link
      aria-hidden="true"
      className={cn(
        "relative mb-3 mt-4 block h-10 w-2.5 shrink-0",
        "md:absolute md:right-[calc(50%+30px)] md:top-[17px] md:my-0 md:h-2.5 md:w-[calc(100%-60px)]",
      )}
    >
      <span
        data-flow-line
        className={cn(
          "absolute bottom-[3px] left-[4px] top-0 w-0.5 origin-top rounded bg-brand-ink/40",
          "md:bottom-auto md:left-0 md:right-[3px] md:top-[4px] md:h-0.5 md:w-auto md:origin-left",
        )}
      />
      <span
        data-flow-head
        className={cn(
          "absolute bottom-[1px] left-[1px] size-2 rotate-45 border-b-2 border-r-2 border-brand-ink/60",
          "md:bottom-auto md:left-auto md:right-[1px] md:top-[1px] md:-rotate-45",
        )}
      />
    </span>
  );
}
