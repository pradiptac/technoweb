import Image from "next/image";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState } from "@/components/ui/empty";
import { PageHero } from "@/components/ui/page-hero";
import { Pagination } from "@/components/ui/pagination";
import { IconLayers } from "@/components/icons";
import { formatDate } from "@/lib/dates";
import type { ContentEntry, ContentTypeSummary, Paginated } from "@/types/api";

/**
 * A custom content type's archive — `/events`, `/downloads`
 * (docs/custom-content.md).
 *
 * Drawn by the CMS catch-all when no page answers the slug: `PageHero`, a
 * theme `Collection` of `Tile`s (so every theme's idiom redraws it the way it
 * redraws the case studies) and the numbered `Pagination` the blog uses. The
 * order is the type's (`newest`, `title`, `manual`), decided by the API.
 */
export function ContentArchive({
  type, entries,
}: {
  type: ContentTypeSummary;
  entries: Paginated<ContentEntry>;
}) {
  const newest = type.sort === "newest";

  return (
    <>
      <PageHero
        kicker={type.plural}
        title={type.plural}
        lede={type.description ?? undefined}
        crumbs={[{ name: type.plural, path: type.path }]}
      />

      <Container data-aos="fade-up" className="section-y">
        {entries.data.length === 0 ? (
          <EmptyState icon={<IconLayers />} title="Nothing published yet">
            Check back soon.
          </EmptyState>
        ) : (
          <Collection kind={`content-${type.slug}`} cols={3} gap="lg">
            {entries.data.map((e, i) => (
              <Tile
                key={e.id}
                href={e.path}
                titleAs="h2"
                kicker={newest && e.published_at ? formatDate(e.published_at) : type.name}
                title={e.title}
                summary={e.summary}
                focus={e.image_focus}
                media={e.image ? (
                  <Image
                    src={e.image}
                    alt={e.image_alt ?? ""}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    loading={i < 3 ? "eager" : undefined}
                    className="object-cover"
                  />
                ) : undefined}
                cta="Read more"
              />
            ))}
          </Collection>
        )}

        <div className="mt-10">
          <Pagination meta={entries.meta} basePath={type.path} showPerPage={false} numbered />
        </div>
      </Container>

      <CtaBand />
    </>
  );
}
