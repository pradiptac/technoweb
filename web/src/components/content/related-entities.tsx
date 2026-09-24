import Link from "next/link";
import { Collection, Tile } from "@/components/ui/collection";
import { cn } from "@/lib/utils";
import type { EntityLink, EntityLinks } from "@/types/api";

/**
 * The record's `entity` block (`docs/aeo-geo-contract.md` §4) as a "Related"
 * section: the brand and the category as a row of chips, then the solutions,
 * services, industries and supporting articles as `Collection`s of `Tile`s,
 * each group only when it has entries and the whole thing nothing when they
 * are all empty.
 *
 * Every link is a **path** the API composed from the record's own slug —
 * the SEO overview's rule — so a rename on the record's edit screen moves
 * these links with it. The tiles are `b`-titled rather than headings: the
 * outline here is the section's `h2` and one `h3` per group, and forty
 * headings for forty links is an outline nobody can use.
 */

const GROUPS: { key: keyof Pick<EntityLinks, "solutions" | "services" | "industries" | "articles">; label: string; kicker: string }[] = [
  { key: "solutions", label: "Solutions", kicker: "Solution" },
  { key: "services", label: "Services", kicker: "Service" },
  { key: "industries", label: "Industries", kicker: "Industry" },
  { key: "articles", label: "Further reading", kicker: "Article" },
];

function Chip({ label, link }: { label: string; link: EntityLink }) {
  return (
    <li>
      <Link
        href={link.path}
        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-card px-3.5 py-1.5 text-13-5 text-ink transition-colors duration-(--duration-base) hover:border-brand-300 hover:bg-brand-50"
      >
        <span className="text-muted">{label}</span>
        <span className="font-semibold">{link.name}</span>
      </Link>
    </li>
  );
}

export function RelatedEntities({ entity, className }: { entity?: EntityLinks | null; className?: string }) {
  if (!entity) return null;

  const chips = [
    ...(entity.brand ? [{ label: "Brand", link: entity.brand }] : []),
    ...(entity.category ? [{ label: "Category", link: entity.category }] : []),
  ];
  const groups = GROUPS.map((g) => ({ ...g, links: entity[g.key] ?? [] })).filter((g) => g.links.length > 0);

  if (chips.length === 0 && groups.length === 0) return null;

  return (
    <section data-aos="fade-up" data-related-entities className={cn("grid gap-6", className)}>
      <h2 className="display-3">Related</h2>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => <Chip key={c.label} label={c.label} link={c.link} />)}
        </ul>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="mb-3 text-13-5 font-semibold uppercase tracking-[.08em] text-muted">{g.label}</h3>
          <Collection kind="related" cols={3} gap="sm">
            {g.links.map((link) => (
              <Tile key={link.path} href={link.path} title={link.name} titleAs="b" kicker={g.kicker} padding="sm" />
            ))}
          </Collection>
        </div>
      ))}
    </section>
  );
}
