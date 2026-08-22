"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { IconChevronDown, IconClose, IconMenu, IconPhone } from "@/components/icons";
import { contact, mainNav } from "@/content/site";
import { telHref, type SiteSettings } from "@/lib/site-settings";
import { MegaMenu } from "@/components/layout/mega-menu";
import { iconMap } from "@/components/icons";
import type { MenuSection } from "@/lib/navigation";

export function SiteHeader({
  menu = {}, settings = {},
}: {
  menu?: Record<string, MenuSection>;
  settings?: SiteSettings;
}) {
  // Settings win, with the static constants as the fallback — the same
  // arrangement as the hero. A site with nothing configured still renders.
  const phone = settings.phone ?? contact.phone;
  const email = settings.support_email ?? contact.email;
  const [open, setOpen] = useState(false);
  // Which drawer section is expanded on mobile, where there is no hover.
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
   * Escape closes the drawer, and the page behind it does not scroll while it
   * is open. Both are what covering most of the screen implies, and neither
   * happens for free.
   *
   * The overflow is restored on cleanup rather than on close, so navigating
   * away with the drawer open cannot leave the body locked.
   */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* utility bar */}
      <div className="bg-dark text-[13px] text-dark-muted">
        <Container className="flex h-[38px] items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href={telHref(phone)} className="flex items-center gap-1.5 py-1.5 hover:text-white">
              <IconPhone className="size-[13px]" />
              {phone}
            </a>
            <a href={`mailto:${email}`} className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">
              {email}
            </a>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/knowledge-base" className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">Knowledge base</Link>
            <Link href="/portal/tickets" className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">Track a ticket</Link>
            <Link href="/portal/login" className="flex items-center py-1.5 hover:text-white">Customer login</Link>
          </div>
        </Container>
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-[14px]">
        <Container className="flex h-[68px] min-w-0 items-center gap-3.5">
          <Link href="/" aria-label="Technoware home" className="shrink-0">
            <Logo className="max-[419px]:text-[20px]" logoUrl={settings.logo_url} companyName={settings.company_name} />
          </Link>

          <nav aria-label="Primary" className="ml-5 hidden min-w-0 min-[1160px]:block">
            <ul className="relative flex gap-0.5">
              {mainNav.map((item) => {
                const section = menu[item.href];

                return (
                  <li key={item.href} className={section ? "group" : undefined}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-3 text-[14.5px] font-medium text-ink-2 transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
                    >
                      {item.label}
                      {section && (
                        <IconChevronDown className="size-[11px] text-faint transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
                      )}
                    </Link>
                    {section && <MegaMenu section={section} />}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ButtonLink href="/contact" variant="ghost" size="sm" className="hidden min-[1160px]:inline-flex">
              Contact
            </ButtonLink>
            <ButtonLink href="/contact" size="sm" className="max-[419px]:px-[13px] max-[419px]:text-[12.5px]">
              <span className="hidden min-[560px]:inline">Request a consultation</span>
              <span className="min-[560px]:hidden">Get a quote</span>
            </ButtonLink>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="grid size-11 place-items-center rounded border border-line-strong bg-white min-[1160px]:hidden"
            >
              <IconMenu className="size-[18px]" />
            </button>
          </div>
        </Container>
      </header>

      {/* mobile drawer */}
      {open && (
        <>
          {/* The dimmed page behind the drawer. Clicking it closes — which is
              what leaving a third of the screen visible implies you can do. */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-ink/45 min-[1160px]:hidden"
          />

          {/* Two thirds of the viewport, anchored right: that is the side the
              toggle sits on, and the thumb that opened it is already there. */}
          <div className="fixed inset-y-0 right-0 z-50 w-2/3 overflow-y-auto bg-white shadow-[-8px_0_32px_rgba(18,20,13,.14)] min-[1160px]:hidden">
          <div className="flex h-[68px] items-center justify-between gap-3 border-b border-line px-5">
            <Logo logoUrl={settings.logo_url} companyName={settings.company_name} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-11 place-items-center rounded border border-line-strong"
            >
              <IconClose className="size-[18px]" />
            </button>
          </div>
          <div className="px-5 py-6">
            <ul className="grid gap-1">
              {mainNav.map((item) => {
                const section = menu[item.href];
                const isOpen = expanded === item.href;

                return (
                  <li key={item.href}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block flex-1 rounded px-3 py-3.5 font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                      >
                        {item.label}
                      </Link>
                      {section && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : item.href)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} ${item.label}`}
                          className="grid size-11 shrink-0 place-items-center rounded border border-line-strong bg-white"
                        >
                          <IconChevronDown
                            className={`size-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {section && isOpen && (
                      <ul className="mt-1 mb-2 grid gap-0.5 border-l border-line pl-3">
                        {section.items.map((child) => {
                          const Icon = child.icon && child.icon in iconMap ? iconMap[child.icon] : null;
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2.5 rounded px-3 py-2.5 text-[15px] hover:bg-surface-2"
                              >
                                {Icon && (
                                  <span className="grid size-7 shrink-0 place-items-center rounded border border-brand-200 bg-brand-50 text-brand-600 [&_svg]:size-3.5">
                                    <Icon />
                                  </span>
                                )}
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-line pt-6">
              <ButtonLink href="/portal/login" variant="secondary" onClick={() => setOpen(false)}>
                Customer login
              </ButtonLink>
              <ButtonLink href="/contact" onClick={() => setOpen(false)}>
                Request a consultation
              </ButtonLink>
            </div>
          </div>
          </div>
        </>
      )}
    </>
  );
}
