import type { CSSProperties } from "react";
import Image from "next/image";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import type { StoryItem, StorySectionData } from "@/types/api";
import { SectionFrame, SectionHead } from "./section-parts";

/**
 * A scroll story (0.114.0, `docs/page-builder.md`): two to six steps, each
 * with its own picture, read by scrolling.
 *
 * **Two layouts in the markup, and CSS alone chooses between them.** Every
 * step carries its own picture above its words — the list a phone, a
 * reduced-motion visitor and a browser without scroll-driven animations all
 * get, a plain stacked list with nothing hidden. From `lg`, with motion
 * allowed and `animation-timeline` supported, globals.css (`[data-story]`)
 * hides those inline pictures and shows the *stage*: one sticky frame beside
 * the steps holding every picture stacked, each fading in on its step's own
 * named view timeline as that step reaches the middle of the screen. No
 * JavaScript decides which layout a visitor gets, so nothing is written onto
 * the server's markup after it arrives.
 *
 * The timelines are named per section (`--<id>-<n>`), declared on each step
 * as a custom property the CSS reads (`view-timeline-name: var(--story-tl)`)
 * and hoisted to the story by `timeline-scope` built from the same list — so
 * two stories on one page never answer each other's scroll, and nothing about
 * a timeline is inline where the guard could not reach it.
 *
 * Exactly one copy of each picture is exposed at a time: the stage is
 * `display: none` in the list layout and the inline pictures are in the
 * staged one, so a screen reader meets each alt text once either way. Both
 * copies are lazy (the hidden one is never fetched) unless the section is
 * among the first two, where the first picture may be the largest paint.
 *
 * Step titles are `h3` under the section's `h2`, and plain paragraphs when the
 * section has no heading — never a level skipped.
 */
export function StorySection({ data, eager, reveal, id }: {
  data: StorySectionData;
  eager: boolean;
  reveal?: SectionRevealAttr | null;
  id: string;
}) {
  const items = (data.items ?? []).filter((it): it is StoryItem => Boolean(it?.title && it.image));
  if (items.length < 2) return null;

  const titled = Boolean(data.heading);
  const base = `--${id.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
  const name = (i: number) => `${base}-${i}`;
  const scope = { "--story-scope": items.map((_, i) => name(i)).join(", ") } as CSSProperties;

  return (
    <SectionFrame type="story" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <div data-story style={scope}>
          <div data-story-stage>
            <div className="relative h-full overflow-hidden rounded-xl border border-line-strong bg-surface-2">
              {items.map((it, i) => (
                <Image
                  key={i}
                  data-story-pic
                  src={it.image}
                  alt={it.image_alt ?? ""}
                  fill
                  sizes="50vw"
                  loading={eager && i === 0 ? "eager" : undefined}
                  className="object-cover"
                  style={{ ...focalStyle(it.image_focus), "--story-tl": name(i) } as CSSProperties}
                />
              ))}
            </div>
          </div>

          <ol data-story-steps>
            {items.map((it, i) => (
              <li key={i} data-story-step style={{ "--story-tl": name(i) } as CSSProperties}>
                <div data-story-inline data-frame className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-xl border border-line-strong bg-surface-2">
                  <Image
                    src={it.image}
                    alt={it.image_alt ?? ""}
                    fill
                    sizes="(min-width: 1024px) 45vw, 90vw"
                    loading={eager && i === 0 ? "eager" : undefined}
                    className="object-cover"
                    style={focalStyle(it.image_focus)}
                  />
                </div>
                <div className="flex gap-4">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-brand-ink/40 bg-card text-15 font-semibold tabular-nums text-brand-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-1.5">
                    {titled
                      ? <h3 className="display-3 text-balance">{it.title}</h3>
                      : <p className="display-3 text-balance">{it.title}</p>}
                    {it.body && it.body.split(/\n\s*\n/).map((para, n) => (
                      <p key={n} className="mt-3 text-base leading-[1.7] text-ink-2 whitespace-pre-line">{para}</p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </SectionFrame>
  );
}
