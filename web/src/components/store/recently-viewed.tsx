"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { formatPaise } from "@/lib/money";

const KEY = "tw_recently_viewed";
const MAX = 6;

/** What a strip row needs and nothing more — never the whole product. */
export type RecentProduct = { slug: string; name: string; image: string | null; price_paise: number };

function read(): RecentProduct[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentProduct[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.slug === "string") : [];
  } catch {
    return [];
  }
}

let cached = "[]";
let parsed: RecentProduct[] = [];

/** A stable reference per stored value, or `useSyncExternalStore` re-renders for ever. */
function snapshot(): RecentProduct[] {
  let raw = "[]";
  try { raw = localStorage.getItem(KEY) ?? "[]"; } catch { /* unavailable */ }
  if (raw !== cached) { cached = raw; parsed = read(); }
  return parsed;
}

const EMPTY: RecentProduct[] = [];

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("tw:recent", cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener("tw:recent", cb); };
}

/**
 * Remembers a product as seen. Mounted on the product page, renders nothing.
 *
 * Front of the list, deduplicated, six kept. `localStorage` only: it never
 * leaves the browser, so there is no cookie, no API and no consent question
 * — the reason the strip below can appear on a site whose trackers wait for
 * consent. Announced with a window event so a strip on the same page (the
 * foot of this one) updates without a reload.
 */
export function RememberProduct({ product }: { product: RecentProduct }) {
  useEffect(() => {
    try {
      const rest = read().filter((p) => p.slug !== product.slug);
      localStorage.setItem(KEY, JSON.stringify([product, ...rest].slice(0, MAX)));
      window.dispatchEvent(new Event("tw:recent"));
    } catch {
      // Storage refused; the strip simply stays empty.
    }
  }, [product]);

  return null;
}

/**
 * The last few products opened, as a strip.
 *
 * Reads the browser's own list through `useSyncExternalStore` with an empty
 * server snapshot, so the server renders nothing and the strip appears after
 * hydration — a list that differs per visitor cannot be in the cached HTML.
 * `exclude` keeps the product being read off its own strip. Renders nothing
 * at all with fewer than two entries: one card under "Recently viewed" is
 * the page pointing at itself.
 */
export function RecentlyViewed({ exclude, className }: { exclude?: string; className?: string }) {
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const items = all.filter((p) => p.slug !== exclude);

  if (items.length < 2) return null;

  return (
    <section aria-labelledby="recently-viewed" className={className}>
      <h2 id="recently-viewed" className="mb-4 text-18 font-semibold">Recently viewed</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((p) => (
          <li key={p.slug}>
            <Link href={`/store/products/${p.slug}`} className="group block overflow-hidden rounded-lg border border-line-strong bg-card transition-colors duration-(--duration-base) hover:border-brand-300">
              <span className="relative block aspect-[4/3] bg-surface">
                {p.image && <Image src={p.image} alt="" fill sizes="(min-width: 1024px) 16vw, 50vw" className="object-cover" />}
              </span>
              <span className="block p-2.5">
                <span className="line-clamp-2 block text-13 font-semibold leading-snug text-ink">{p.name}</span>
                <span className="mt-1 block font-mono text-12-5 text-muted">{formatPaise(p.price_paise)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
