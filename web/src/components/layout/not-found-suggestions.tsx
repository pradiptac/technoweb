"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Suggestion = { title: string; path: string; label: string };
type Group = { label: string; items: { title: string; path: string }[] };

/**
 * What the address was probably after (0.122.0).
 *
 * A 404 is nearly always a real page whose address moved or was mistyped,
 * and the last part of the address still says what it was about:
 * `/products/cisco-cbs350-24t` is a search for "cisco cbs350 24t". This asks
 * the site's own search for that — the route handler the header's search box
 * already uses — and offers up to five matches. Nothing is drawn until
 * something comes back, so an address that says nothing costs a visitor
 * nothing.
 *
 * A client island because only the browser knows the address: a not-found
 * boundary is given no params.
 */
function termFrom(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";

  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // A malformed escape: search for it as typed.
  }

  return decoded
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_+.]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .trim()
    .slice(0, 80);
}

export function NotFoundSuggestions() {
  const pathname = usePathname();
  const [found, setFound] = useState<Suggestion[]>([]);

  useEffect(() => {
    const term = termFrom(pathname ?? "");
    if (term.length < 3) return;

    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((body: { data?: Group[] }) => {
        const flat = (body.data ?? []).flatMap((g) => g.items.map((item) => ({ ...item, label: g.label })));
        setFound(flat.slice(0, 5));
      })
      .catch(() => {
        // Nothing a reader can act on; the search box above still works.
      });

    return () => controller.abort();
  }, [pathname]);

  if (found.length === 0) return null;

  return (
    <div className="settle-in mt-8 max-w-[560px]" data-not-found-suggestions>
      <h2 className="text-15-5 font-semibold">Were you looking for one of these?</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {found.map((s) => (
          <li key={s.path}>
            <Link href={s.path} className="group flex items-baseline gap-3 py-3">
              <span className="min-w-0 flex-1 font-semibold text-ink group-hover:text-brand-ink">{s.title}</span>
              <span className="shrink-0 text-13 text-muted">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
