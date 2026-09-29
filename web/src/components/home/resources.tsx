import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { SectionHeader } from "@/components/ui/card";
import { Collection, Tile } from "@/components/ui/collection";
import type { BlogPost } from "@/types/api";
import { CountUp } from "@/components/ui/count-up";

/**
 * A `Collection` of `posts`, drawn in each theme's idiom — see
 * `components/ui/collection.tsx`. The date block is the tile's icon slot:
 * a post's identity is when it was written, and the slot is what an idiom
 * moves when it turns the tile into a row.
 */
export function Resources({ items }: { items: BlogPost[] }) {
  return (
    <section id="resources" className="relative overflow-hidden border-y border-line bg-surface section-y-lg">
      {/* Decorative only — see the note on `.pattern-fade` in globals.css. */}
      <div
        aria-hidden
        className="pattern-fade pointer-events-none absolute inset-0 opacity-50 [background-image:url(/patterns/circle-fade.svg)] [background-size:700px_700px] [background-position:center] [background-repeat:no-repeat]"
      />
      <Container className="relative">
        <SectionHeader
          kicker="Resources"
          title="Written by the engineers on the job."
          lede="Field notes, configuration guides and knowledge-base articles — the same material our support desk uses."
        />
        <Collection fill kind="posts" cols={2}>
          {items.map((p) => {
            const published = p.published_at ? new Date(p.published_at) : null;
            return (
              <Tile
                key={p.slug}
                href={`/blog/${p.slug}`}
                title={p.title}
                summary={p.excerpt}
                icon={
                  <span data-tile-date className="grid place-content-center rounded-lg bg-brand-50 px-3.5 py-2 text-center font-mono">
                    <b className="block text-19 text-brand-ink">{published ? published.getDate() : "—"}</b>
                    <span className="text-11 uppercase tracking-[.04em] text-brand-ink">
                      {published ? published.toLocaleString("en-GB", { month: "short" }) : ""}
                    </span>
                  </span>
                }
                meta={
                  <>
                    {p.reading_minutes ? <><CountUp value={p.reading_minutes} /> min read</> : ""}
                    {p.author?.name ? ` · ${p.author.name}` : ""}
                  </>
                }
                cta="Read the article"
              />
            );
          })}
        </Collection>
        <div className="mt-6.5">
          <ButtonLink href="/resources" variant="secondary">
            All resources <IconArrowRight />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
