import { IconLinkedin, IconMail } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/api";
import Image from "next/image";

/**
 * The people, as cards.
 *
 * A fixed 4:3 photo well so a slow picture cannot move the grid — the rule
 * every cover on this site follows — and an initials tile in the well when
 * there is no photo, rather than a blank square. Everything written sits
 * **under** the photo: a caption over a photograph nobody has seen yet
 * cannot be made legible, which the gallery measured at 1.13:1.
 *
 * The certifications are chips; the API has already dropped the lapsed
 * ones. Email and LinkedIn render only when filled, as icon links with a
 * name of their own — the visible content is a glyph.
 *
 * `groupBy` splits the grid by department when there is more than one, in
 * the order the departments first appear — which is the members' own
 * `sort_order`, so an editor orders the departments by ordering the people.
 */
export function TeamGrid({
  members, groupByDepartment = false, headingLevel = 2, className,
}: {
  members: TeamMember[];
  groupByDepartment?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  if (members.length === 0) return null;

  const groups = groupByDepartment ? group(members) : [{ name: null, members }];
  // A department heading exists only when there is more than one; the cards
  // step down one level under it and sit at the given level without it — a
  // card at h4 straight under the page's h2 is a heading jump the audit fails.
  const grouped = groups.length > 1;
  const GroupHeading = `h${headingLevel}` as "h2" | "h3";
  const CardHeading = `h${grouped ? Math.min(headingLevel + 1, 4) : headingLevel}` as "h2" | "h3" | "h4";

  return (
    <div className={cn("grid gap-12", className)}>
      {groups.map((g, gi) => (
        <section key={g.name ?? "all"} aria-labelledby={g.name && grouped ? `team-${slugify(g.name)}` : undefined}>
          {g.name && grouped && (
            <GroupHeading id={`team-${slugify(g.name)}`} className="display-3 mb-6">{g.name}</GroupHeading>
          )}
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.members.map((m, i) => (
              <li key={m.id} className="flex flex-col overflow-hidden rounded-lg border-2 border-line-strong bg-card">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
                  {m.photo ? (
                    // The first row is above the fold under every theme, and under one
                    // whose hero has no banner (Datacenter) a photo there is the LCP:
                    // eager, never `priority`, the case-study grid's rule.
                    <Image src={m.photo} alt={m.photo_alt} fill sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" loading={gi === 0 && i < 4 ? "eager" : undefined} className="object-cover" />
                  ) : (
                    <span aria-hidden className="grid size-full place-items-center font-display text-[44px] font-semibold text-faint">
                      {initials(m.name)}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <CardHeading className="text-17 font-semibold leading-snug">{m.name}</CardHeading>
                  {m.designation && (
                    <p className="mt-0.5 text-13-5 font-medium text-brand-ink">{m.designation}</p>
                  )}
                  {m.bio && (
                    <p className="mt-3 text-14 leading-[1.6] text-muted">{m.bio}</p>
                  )}

                  {m.certifications.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${m.name}'s certifications`}>
                      {m.certifications.map((c) => (
                        <li
                          key={c.name}
                          title={c.issuer ? `${c.name} — ${c.issuer}` : c.name}
                          className="rounded-full border border-brand-ink/30 bg-brand-50 px-2.5 py-1 text-12 font-semibold text-brand-ink"
                        >
                          {c.name}
                        </li>
                      ))}
                    </ul>
                  )}

                  {(m.email || m.linkedin_url) && (
                    <ul className="mt-auto flex gap-2 pt-5">
                      {m.email && (
                        <li>
                          <a
                            href={`mailto:${m.email}`}
                            aria-label={`Email ${m.name}`}
                            title={`Email ${m.name}`}
                            className="grid size-10 place-items-center rounded-md border border-line-strong bg-card text-muted transition-colors hover:border-brand-300 hover:text-brand-ink"
                          >
                            <IconMail className="size-4" aria-hidden />
                          </a>
                        </li>
                      )}
                      {m.linkedin_url && (
                        <li>
                          <a
                            href={m.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${m.name} on LinkedIn`}
                            title={`${m.name} on LinkedIn`}
                            className="grid size-10 place-items-center rounded-md border border-line-strong bg-card text-muted transition-colors hover:border-brand-300 hover:text-brand-ink"
                          >
                            <IconLinkedin className="size-4" aria-hidden />
                          </a>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function group(members: TeamMember[]): { name: string | null; members: TeamMember[] }[] {
  const out: { name: string | null; members: TeamMember[] }[] = [];
  for (const m of members) {
    const name = m.department?.trim() || null;
    const existing = out.find((g) => g.name === name);
    if (existing) existing.members.push(m);
    else out.push({ name, members: [m] });
  }
  // People with no department go last, under no heading.
  return [...out.filter((g) => g.name !== null), ...out.filter((g) => g.name === null)];
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** The section is named by its visible heading rather than a second copy of the text. */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
