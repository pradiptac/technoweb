"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A row of the portal's navigation, with its glyph already rendered.
 *
 * The icons arrive as elements from `portal-links.tsx`, a server module,
 * rather than being imported here: this file is a client component, and
 * importing six glyphs from `@/components/icons` put the whole ~130-icon
 * map (47KB, 14KB gzipped) in every customer's portal bundle — the trap
 * CLAUDE.md records for the public site, on the one area it had not been
 * applied to. A server component may pass JSX to a client component and
 * React serialises the markup, which is how `lib/navigation.ts` hands the
 * header its identity tiles.
 */
export type PortalLink = { href: string; label: string; exact?: boolean; icon: ReactNode };

export function PortalNav({ links, knowledgeBaseIcon }: { links: PortalLink[]; knowledgeBaseIcon: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // min-w-0 for the same reason as admin-nav: without it this grid item will
  // not shrink, and the row of links overflows the page on a narrow screen.
  return (
    <nav aria-label="Portal" className="min-w-0 lg:sticky lg:top-24">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {links.map((l) => (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              aria-current={isActive(l.href, l.exact) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded px-3.5 py-2.5 text-sm font-medium transition-colors duration-(--duration-base)",
                isActive(l.href, l.exact)
                  ? "bg-brand-50 text-brand-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {/*
                `currentColor`, so the glyph follows the row's own state
                rather than being coloured separately — these are UI icons
                doing a job, not identity icons standing for a record, which
                is the split `iconMap` and `IdentityIcon` draw.
              */}
              {l.icon}
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 hidden rounded-lg border border-line-strong bg-surface p-4 lg:block">
        <p className="text-13 leading-normal text-muted">
          Before raising a ticket, it is worth a look at the knowledge base — most
          configuration questions are already answered there.
        </p>
        <Link
          href="/knowledge-base"
          className="mt-3 inline-flex items-center gap-1.5 py-1 text-13 font-semibold text-brand-ink hover:underline"
        >
          {knowledgeBaseIcon}
          Browse knowledge base
        </Link>
      </div>
    </nav>
  );
}
