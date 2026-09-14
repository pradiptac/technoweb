"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * One search form for the site's two searches — `/search` and the knowledge
 * base — which were two files differing only in where they posted and how
 * they read their starting value. Search is a plain GET navigation rather
 * than client-side fetching: the results page stays server-rendered,
 * shareable and indexable, and a query with no JavaScript still works. The
 * router push only avoids a full document load when JS is available.
 *
 * Both controls are `h-11`, the 44px the catalogue filter bars use and the
 * tap target the phone audit wants; measured before that was written down
 * the same control came to 51px on one page and 44 on the other.
 *
 * `defaultValue` wins over the URL's `?q=` when given, so the results page
 * can pass the term it already parsed; the knowledge base reads the URL.
 * Reading `useSearchParams` means a static page rendering this must sit
 * inside a `<Suspense>` — see `not-found-content.tsx`.
 */
export function SearchForm({
  action = "/search",
  label = "Search the site",
  placeholder = "Product name, SKU, or a question…",
  defaultValue,
  className,
}: {
  action?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** On the input — the two pages cap it at different widths. */
  className?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? params.get("q") ?? "");
  const id = action === "/search" ? "site-q" : "kb-q";

  return (
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const term = value.trim();
        router.push(term ? `${action}?q=${encodeURIComponent(term)}` : action);
      }}
      className="flex flex-wrap gap-2.5"
    >
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input
        id={id}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={className ?? "h-11 min-w-0 flex-1 py-0 sm:max-w-[460px]"}
      />
      <Button type="submit" className="h-11 py-0">Search</Button>
    </form>
  );
}

/** The knowledge base's search: the same control, posting to `/knowledge-base`. */
export function KbSearchForm({ action = "/knowledge-base" }: { action?: string }) {
  return (
    <SearchForm
      action={action}
      label="Search the knowledge base"
      placeholder="e.g. configure business email on iPhone"
      className="h-11 min-w-0 flex-1 py-0 sm:max-w-[420px]"
    />
  );
}
