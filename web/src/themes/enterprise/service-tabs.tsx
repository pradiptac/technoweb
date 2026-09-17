"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/icons-ui";
import { cn } from "@/lib/utils";

/**
 * The services as tabs — the reference site's "service tabs": a row of
 * names, and under the chosen one a picture beside a paragraph and a link.
 *
 * A small client island: the tab strip is the only stateful thing on the
 * Enterprise front page. Every panel is rendered and the inactive ones are
 * `hidden`, so the pictures for the other tabs are already decoded when
 * they are chosen and a search engine reads every service's paragraph.
 * The pictures cycle through the theme's own two photographs, since a
 * service record has no picture of its own; `sizes` matches the half-width
 * column they sit in. Tabs are buttons with `aria-selected` and the
 * panels `role="tabpanel"`, and arrow keys move between tabs.
 */
export type ServiceTab = { slug: string; title: string; summary: string | null; href: string };

const PICTURES = ["/themes/enterprise/boardroom.jpg", "/themes/enterprise/servers.jpg"];

export function ServiceTabs({ items }: { items: ServiceTab[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  if (items.length === 0) return null;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((i + 1) % items.length); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setActive((i - 1 + items.length) % items.length); }
  };

  return (
    <div>
      <div role="tablist" aria-label="Services" className="flex gap-1 overflow-x-auto border-b border-line-strong [scrollbar-width:thin]">
        {items.map((s, i) => (
          <button
            key={s.slug}
            role="tab"
            type="button"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-[3px] px-4 py-3 text-13-5 font-semibold transition-colors duration-(--duration-base)",
              i === active ? "border-brand-600 text-brand-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {s.title}
          </button>
        ))}
      </div>
      {items.map((s, i) => (
        <div
          key={s.slug}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
          className="grid items-center gap-8 pt-8 lg:grid-cols-2 lg:gap-14"
        >
          <div className="relative aspect-[16/10] overflow-hidden rounded-sm border border-line-strong bg-surface-2">
            <Image src={PICTURES[i % PICTURES.length]} alt="" aria-hidden fill sizes="(min-width: 1024px) 50vw, 100vw" loading={i === 0 ? "eager" : undefined} className="object-cover" />
          </div>
          <div>
            <h3 className="display-3">{s.title}</h3>
            {s.summary && <p className="lede mt-3">{s.summary}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={s.href}>Learn more <IconArrowRight /></ButtonLink>
              <Link href="/contact" className="inline-flex items-center gap-1.5 self-center text-13-5 font-semibold text-brand-ink hover:underline">Talk to us</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
