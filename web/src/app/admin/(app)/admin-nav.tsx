"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/tickets", label: "Tickets" },
];

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Admin" className="lg:sticky lg:top-24">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {links.map((l) => (
          <li key={l.href} className="shrink-0">
            <Link
              href={l.href}
              aria-current={isActive(l.href, l.exact) ? "page" : undefined}
              className={cn(
                "block rounded px-3.5 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive(l.href, l.exact)
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
