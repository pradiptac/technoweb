import type { Archive } from "@/app/(marketing)/[slug]/archive";
import { ArchiveShell } from "./archive-shell";
import { QuoteCard, type PresetEntry } from "./preset-parts";

/**
 * Testimonials as quote cards in columns (docs/content-presets.md), in the
 * type's own order. CSS columns, not a grid: quotes are different lengths,
 * and a grid would leave a hole beside every short one.
 */
export function TestimonialsArchive({ archive }: { archive: Archive }) {
  return (
    <ArchiveShell archive={archive}>
      <h2 className="sr-only">What our customers say</h2>
      <ul className="columns-1 gap-6 sm:columns-2 lg:columns-3">
        {archive.entries.data.map((e) => <QuoteCard key={e.id} entry={e as PresetEntry} />)}
      </ul>
    </ArchiveShell>
  );
}
