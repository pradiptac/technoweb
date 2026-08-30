"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The newsletter's own navigation.
 *
 * Six screens sat behind one sidebar entry, and five of them were reachable
 * only by typing a URL — Groups was linked from one sentence inside the import
 * wizard, and Templates from nowhere at all. That is not a discoverability
 * nicety: a campaign is sent to groups, so with no way to reach Groups the
 * Audience tab has nothing to offer and the whole module appears to be missing
 * a feature it has.
 *
 * A strip here rather than six more entries in the sidebar: the admin nav is an
 * accordion of four sections, and adding six links to one of them makes the
 * newsletter louder than Content. This is the shape the specification asks for.
 */
const LINKS = [
  { href: "/admin/newsletter", label: "Dashboard", exact: true },
  { href: "/admin/newsletter/subscribers", label: "Subscribers" },
  { href: "/admin/newsletter/groups", label: "Groups" },
  { href: "/admin/newsletter/campaigns", label: "Campaigns" },
  { href: "/admin/newsletter/templates", label: "Templates" },
  { href: "/admin/newsletter/unsubscribes", label: "Unsubscribes" },
];

export function NewsletterNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Newsletter" className="mb-4 border-b border-line">
      <ul className="flex flex-wrap gap-0.5">
        {LINKS.map((link) => {
          /*
            A section is current for everything beneath it, so the Campaigns
            tab stays lit while editing one — except Dashboard, which would
            otherwise match every path in the module and light up permanently.
          */
          const current = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px block rounded-t border-b-2 px-3.5 py-1.5 text-[13px]",
                  current
                    ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
                    : "border-transparent font-medium text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
