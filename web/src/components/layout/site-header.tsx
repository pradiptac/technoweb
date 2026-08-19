"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { IconChevronDown, IconClose, IconMenu, IconPhone } from "@/components/icons";
import { contact, mainNav } from "@/content/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

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
            <a href={contact.phoneHref} className="flex items-center gap-1.5 py-1.5 hover:text-white">
              <IconPhone className="size-[13px]" />
              {contact.phone}
            </a>
            <a href={`mailto:${contact.email}`} className="hidden py-1.5 hover:text-white sm:inline-flex sm:items-center">
              {contact.email}
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
            <Logo className="max-[419px]:text-[20px]" />
          </Link>

          <nav aria-label="Primary" className="ml-5 hidden min-w-0 min-[1160px]:block">
            <ul className="flex gap-0.5">
              {mainNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-3 text-[14.5px] font-medium text-ink-2 transition-colors duration-200 hover:bg-surface-2 hover:text-ink"
                  >
                    {item.label}
                    {"hasChildren" in item && item.hasChildren && (
                      <IconChevronDown className="size-[11px] text-faint" />
                    )}
                  </Link>
                </li>
              ))}
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
        <div className="fixed inset-0 z-50 bg-white min-[1160px]:hidden">
          <Container className="flex h-[68px] items-center justify-between border-b border-line">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-11 place-items-center rounded border border-line-strong"
            >
              <IconClose className="size-[18px]" />
            </button>
          </Container>
          <Container className="py-6">
            <ul className="grid gap-1">
              {mainNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded px-3 py-3.5 font-display text-lg font-semibold tracking-[-.02em] hover:bg-surface-2"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-3 border-t border-line pt-6">
              <ButtonLink href="/portal/login" variant="secondary" onClick={() => setOpen(false)}>
                Customer login
              </ButtonLink>
              <ButtonLink href="/contact" onClick={() => setOpen(false)}>
                Request a consultation
              </ButtonLink>
            </div>
          </Container>
        </div>
      )}
    </>
  );
}
