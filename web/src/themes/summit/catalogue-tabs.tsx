"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The tabbed catalogue — the reference site's "All products / SMEs /
 * Enterprises / Telcos" switcher, drawn here over the three things this
 * site sells: solutions, product categories and industries. One row of
 * tab pills, and under the chosen one a grid of tiles with an identity
 * icon, a name and a line. Every panel is rendered and the inactive ones
 * `hidden`, so a search engine reads all three lists; arrow keys move
 * between tabs. The tiles are `data-card`, so the theme's rules reach them.
 *
 * `icon` arrives as a rendered element, not a name: this is a client
 * island, and `IconTile` imports the whole icon map — the Turbopack rule
 * in CLAUDE.md, where one glyph shipped ~130. The server renders the tile
 * (`Home`) and React serialises the markup.
 */
export type CatalogueGroup = { id: string; label: string; items: { slug: string; title: string; summary: string | null; icon: ReactNode; href: string }[] };

export function CatalogueTabs({ groups }: { groups: CatalogueGroup[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const shown = groups.filter((g) => g.items.length > 0);
  if (shown.length === 0) return null;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((i + 1) % shown.length); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setActive((i - 1 + shown.length) % shown.length); }
  };

  return (
    <div>
      <div role="tablist" aria-label="Catalogue" className="flex flex-wrap justify-center gap-2">
        {shown.map((g, i) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "rounded-full border px-4 py-2 text-13-5 font-semibold transition-colors duration-(--duration-base)",
              i === active ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card text-ink-2 hover:border-brand-300 hover:text-brand-ink",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      {shown.map((g, i) => (
        <ul
          key={g.id}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {g.items.map((it) => (
            <li key={it.slug}>
              <Link href={it.href} data-card className="flex h-full flex-col gap-3 rounded-xl border border-line-strong bg-card p-5 transition-colors duration-(--duration-base) hover:border-brand-300">
                {it.icon}
                <span className="text-15 font-semibold text-ink">{it.title}</span>
                {it.summary && <span className="line-clamp-3 text-13 leading-relaxed text-muted">{it.summary}</span>}
                <span className="mt-auto pt-1 text-13 font-semibold text-brand-ink">Learn more →</span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
