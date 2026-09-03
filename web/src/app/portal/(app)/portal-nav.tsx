"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  IconAccessCard, IconBook, IconBox, IconGrid, IconHeadset, IconTicket,
} from "@/components/icons";

const links = [
  { href: "/portal", label: "Dashboard", exact: true, icon: IconGrid },
  // Orders before tickets: somebody who has bought something opens the portal
  // to see where it is far more often than to raise a ticket.
  { href: "/portal/orders", label: "My orders", icon: IconBox },
  { href: "/portal/tickets", label: "My tickets", icon: IconTicket },
  { href: "/portal/tickets/new", label: "Submit a ticket", icon: IconHeadset },
  { href: "/portal/profile", label: "My profile", icon: IconAccessCard },
];

export function PortalNav() {
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
                "flex items-center gap-2.5 rounded px-3.5 py-2.5 text-sm font-medium transition-colors duration-200",
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
              <l.icon className="size-4 shrink-0" />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 hidden rounded-lg border border-line-strong bg-surface p-4 lg:block">
        <p className="text-[13px] leading-normal text-muted">
          Before raising a ticket, it is worth a look at the knowledge base — most
          configuration questions are already answered there.
        </p>
        <Link
          href="/knowledge-base"
          className="mt-3 inline-flex items-center gap-1.5 py-1 text-[13px] font-semibold text-brand-ink hover:underline"
        >
          <IconBook className="size-3.5" />
          Browse knowledge base
        </Link>
      </div>
    </nav>
  );
}

export function NewTicketButton() {
  return (
    <Link
      href="/portal/tickets/new"
      className="inline-flex items-center justify-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-[13.5px] font-semibold text-white shadow-2 transition-colors hover:bg-brand-700"
    >
      <IconTicket className="size-4" />
      Submit a ticket
    </Link>
  );
}
