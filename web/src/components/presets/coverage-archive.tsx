import type { Archive } from "@/app/(marketing)/[slug]/archive";
import { ArchiveShell } from "./archive-shell";
import { CoverageCard, type PresetEntry } from "./preset-parts";

/**
 * What others have written about the company (docs/content-presets.md), newest
 * first. A piece of coverage has no page here: its card links out.
 */
export function CoverageArchive({ archive }: { archive: Archive }) {
  return (
    <ArchiveShell archive={archive}>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {archive.entries.data.map((e) => <CoverageCard key={e.id} entry={e as PresetEntry} headingAs="h2" />)}
      </ul>
    </ArchiveShell>
  );
}
