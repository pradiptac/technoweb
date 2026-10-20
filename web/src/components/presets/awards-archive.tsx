import { ArrowLink } from "@/components/ui/button";
import { publicApi } from "@/lib/api";
import type { Archive } from "@/app/(marketing)/[slug]/archive";
import type { AwardData } from "@/types/presets";
import { ArchiveShell } from "./archive-shell";
import { AwardBadge, dataOf, groupBy, type PresetEntry } from "./preset-parts";

/**
 * Awards by year (docs/content-presets.md), each with its badge and who gave
 * it, ending on a link to the certifications when there are any.
 */
export async function AwardsArchive({ archive }: { archive: Archive }) {
  const rows = archive.entries.data as PresetEntry[];
  const groups = groupBy(rows, (e) => String(dataOf<AwardData>(e).year ?? ""))
    .sort((a, b) => Number(b.key) - Number(a.key));
  const certifications = await publicApi.certifications().then((r) => r.data.length > 0).catch(() => false);

  return (
    <ArchiveShell archive={archive} after={certifications ? (
      <p className="mt-12"><ArrowLink href="/certifications">See our certifications</ArrowLink></p>
    ) : null}>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`awards-${g.key}`} className="mt-12 first:mt-0">
          <h2 id={`awards-${g.key}`} className="display-3 mb-6 text-ink">{g.key}</h2>
          <ul className="grid grid-cols-1 gap-6 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.rows.map((e) => <AwardBadge key={e.id} entry={e} />)}
          </ul>
        </section>
      ))}
    </ArchiveShell>
  );
}
