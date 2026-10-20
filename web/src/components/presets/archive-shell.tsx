import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { EmptyState } from "@/components/ui/empty";
import { PageHero } from "@/components/ui/page-hero";
import { Pagination } from "@/components/ui/pagination";
import { IconLayers } from "@/components/icons";
import type { Archive } from "@/app/(marketing)/[slug]/archive";

/** The frame every preset archive shares: the heading, the body, the pager, the closing band. */
export function ArchiveShell({ archive, children, params, before, after, empty }: {
  archive: Archive;
  children: ReactNode;
  params?: Record<string, string | undefined>;
  /** Drawn above the list whether or not it has rows — a filter, say. */
  before?: ReactNode;
  /** What an empty list says, in place of the default. */
  empty?: ReactNode;
  /** Drawn after the pager, inside the page's own container. */
  after?: ReactNode;
}) {
  const { type, entries } = archive;

  return (
    <div data-preset={type.preset ?? undefined}>
      <PageHero
        title={type.plural}
        lede={type.description ?? undefined}
        crumbs={[{ name: type.plural, path: type.path }]}
      />

      <Container className="section-y">
        {before}
        {entries.data.length === 0 ? (empty ?? (
          <EmptyState icon={<IconLayers />} title="Nothing published yet">
            Check back soon.
          </EmptyState>
        )) : children}

        {entries.meta.last_page > 1 ? (
          <div className="mt-10">
            <Pagination meta={entries.meta} basePath={type.path} params={params} showPerPage={false} numbered />
          </div>
        ) : null}

        {after}
      </Container>

      <CtaBand />
    </div>
  );
}
