"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { IconBook, IconTicket } from "@/components/icons";

const links = [
  { href: "/portal", label: "Dashboard", exact: true },
  { href: "/portal/tickets", label: "My tickets" },
  { href: "/portal/tickets/new", label: "Submit a ticket" },
  { href: "/portal/profile", label: "My profile" },
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
                "block rounded px-3.5 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive(l.href, l.exact)
                  ? "bg-brand-50 text-brand-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
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
