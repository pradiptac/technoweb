import Link from "next/link";
import {
  IconAccessCard, IconBook, IconBox, IconGrid, IconHeadset, IconTicket,
} from "@/components/icons";
import type { PortalLink } from "./portal-nav";

/**
 * The portal's navigation, built on the server so the glyphs are rendered
 * markup by the time they reach `PortalNav` (a client component) — see the
 * note there. This module has no `"use client"` and must not gain one.
 */
export function portalLinks(): PortalLink[] {
  const glyph = "size-4 shrink-0";
  return [
    { href: "/portal", label: "Dashboard", exact: true, icon: <IconGrid className={glyph} /> },
    // Orders before tickets: somebody who has bought something opens the portal
    // to see where it is far more often than to raise a ticket.
    { href: "/portal/orders", label: "My orders", icon: <IconBox className={glyph} /> },
    { href: "/portal/tickets", label: "My tickets", icon: <IconTicket className={glyph} /> },
    { href: "/portal/tickets/new", label: "Submit a ticket", icon: <IconHeadset className={glyph} /> },
    { href: "/portal/profile", label: "My profile", icon: <IconAccessCard className={glyph} /> },
  ];
}

export const knowledgeBaseIcon = <IconBook className="size-3.5" />;

export function NewTicketButton() {
  return (
    <Link
      href="/portal/tickets/new"
      className="inline-flex items-center justify-center gap-2 rounded bg-brand-600 px-4 py-[11px] text-13-5 font-semibold text-brand-on shadow-2 transition-colors hover:bg-brand-700"
    >
      <IconTicket className="size-4" />
      Submit a ticket
    </Link>
  );
}
