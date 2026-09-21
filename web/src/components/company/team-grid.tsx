import { IconCheck, IconLinkedin, IconMail } from "@/components/icons";
import { hueFor } from "@/lib/hues";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/api";
import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import type { CSSProperties } from "react";

/**
 * The people, as portrait cards.
 *
 * A fixed 4:5 photo well — people are portraits, and a 4:3 well cropped
 * every head-and-shoulders picture at the chin — so a slow picture cannot
 * move the grid, the rule every cover on this site follows; an initials
 * tile in the well when there is no photo, on a wash of the person's own
 * hue rather than a blank grey square. Everything written sits **under**
 * the photo: a caption over a photograph nobody has seen yet cannot be
 * made legible, which the gallery measured at 1.13:1.
 *
 * **A colour per person.** `--member-hue` is `hueFor()` on the name — the
 * same twelve graded neon tokens the identity icons and the console's nav
 * use, deterministic so the server and the client agree — and it reaches
 * three places only: the initials tile, the rule between photo and body,
 * and the chips' edges. Never the words. The neon set is graded to 3:1 for
 * a glyph on a surface, not 4.5:1 for text, so the designation stays
 * `text-brand-ink`.
 *
 * The contact row is two pill links with a word on them — "Email",
 * "LinkedIn" — where it was two 40px squares holding a glyph each: the one
 * control on the card without a visible name, on a page whose every other
 * control has one. Nothing on the card is hover-only; Launch's rising
 * panel is that theme's own idiom and stays theirs.
 *
 * The certifications are chips; the API has already dropped the lapsed
 * ones. `groupBy` splits the grid by department when there is more than
 * one, in the order the departments first appear — which is the members'
 * own `sort_order`, so an editor orders the departments by ordering the
 * people — and the department is drawn as a kicker on the card only when
 * the grid is *not* grouped, since the heading already says it then.
 *
 * **The card is themed by attribute, not by branching.** It carries
 * `data-card` (the theme's card rules), and its parts `data-team-photo`,
 * `data-team-body`, `data-team-role` and `data-team-detail` (the bio and
 * the chips), so each theme's `theme.css` redraws it without a second
 * component — the client's ask on 2026-09-17, that every inner page change
 * with the theme. The themes that round the photograph (Launch, Canvas,
 * Vantage) pin `aspect-ratio: 1` themselves, so the 4:5 base cannot make
 * an oval of them; every hue use here is a class, so a theme's own rule
 * on the same part still wins.
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
            <div className="mb-6 flex items-baseline gap-3">
              <GroupHeading id={`team-${slugify(g.name)}`} className="display-3">{g.name}</GroupHeading>
              <span className="text-13-5 text-muted">{g.members.length}</span>
            </div>
          )}
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.members.map((m, i) => (
              <li
                key={m.id}
                data-card
                className="group/member relative flex flex-col overflow-hidden rounded-lg border-2 border-line-strong bg-card"
                style={{ "--member-hue": hueFor(m.name) } as CSSProperties}
              >
                <div data-team-photo className="relative aspect-[4/5] w-full overflow-hidden bg-surface-2">
                  {m.photo ? (
                    // The first row is above the fold under every theme, and under one
                    // whose hero has no banner (Datacenter) a photo there is the LCP:
                    // eager, never `priority`, the case-study grid's rule. `scale`, not
                    // `transform` — Tailwind v4's utilities set the `scale` property.
                    <Image
                      src={m.photo}
                      alt={m.photo_alt}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      loading={gi === 0 && i < 4 ? "eager" : undefined}
                      className="object-cover transition-[scale] duration-(--duration-slow) ease-brand motion-safe:group-hover/member:scale-[1.03]"
                      style={focalStyle(m.photo_focus)}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid size-full place-items-center bg-[color-mix(in_srgb,var(--member-hue)_10%,var(--color-surface-2))] font-display text-[44px] font-semibold text-[var(--member-hue)]"
                    >
                      {initials(m.name)}
                    </span>
                  )}
                </div>
                {/* The person's colour, as a rule between the picture and the words. */}
                <span aria-hidden data-team-rule className="block h-[3px] w-full bg-[var(--member-hue)]" />

                <div data-team-body className="flex flex-1 flex-col p-5">
                  {!grouped && m.department && (
                    <p className="mb-1.5 text-11-5 font-semibold uppercase tracking-[.08em] text-muted">{m.department}</p>
                  )}
                  <CardHeading className="text-18 font-semibold leading-snug tracking-[-.01em]">{m.name}</CardHeading>
                  {m.designation && (
                    <p data-team-role className="mt-0.5 text-13-5 font-medium text-brand-ink">{m.designation}</p>
                  )}
                  {(m.bio || m.certifications.length > 0) && (
                    <div data-team-detail>
                      {m.bio && (
                        // Four lines on the card, the whole text in the title. Nothing
                        // here appears on hover; a theme that wants a rising panel
                        // draws its own (Launch).
                        <p className="mt-3 line-clamp-4 text-14 leading-[1.6] text-muted" title={m.bio}>{m.bio}</p>
                      )}

                      {m.certifications.length > 0 && (
                        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${m.name}'s certifications`}>
                          {m.certifications.map((c) => (
                            <li
                              key={c.name}
                              title={c.issuer ? `${c.name} — ${c.issuer}` : c.name}
                              className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--member-hue)_35%,transparent)] bg-card px-2.5 py-1 text-12 font-semibold text-ink"
                            >
                              <IconCheck className="size-3 shrink-0 text-brand-ink" aria-hidden />
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {(m.email || m.linkedin_url) && (
                    <ul className="mt-auto flex flex-wrap gap-2 pt-5">
                      {m.email && (
                        <li>
                          <a
                            href={`mailto:${m.email}`}
                            title={`Email ${m.name}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-13 font-medium text-muted transition-colors duration-(--duration-base) hover:border-brand-300 hover:text-brand-ink"
                          >
                            <IconMail className="size-4" aria-hidden />
                            Email
                          </a>
                        </li>
                      )}
                      {m.linkedin_url && (
                        <li>
                          <a
                            href={m.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${m.name} on LinkedIn`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-13 font-medium text-muted transition-colors duration-(--duration-base) hover:border-brand-300 hover:text-brand-ink"
                          >
                            <IconLinkedin className="size-4" aria-hidden />
                            LinkedIn
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
