"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconBox, IconSearch } from "@/components/icons-ui";
import type { StoreSuggestion } from "@/types/api";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CyclingPlaceholder } from "@/components/velora/vanish-input";

/**
 * The shop's search box, with the products it would find listed under it as
 * they are typed for.
 *
 * ## A listbox, not a `<datalist>`
 *
 * The company field and the PIN code's city both use a native datalist, and
 * the reasoning there — no new tap targets, no hand-written keyboard handling,
 * degrades to a plain input — is right for a list of *names*. This list is
 * pictures: a thumbnail beside each name is what tells "Cisco CBS350-24T" from
 * "Cisco CBS350-24P" at a glance, and a datalist can draw nothing but text.
 * So this is a WAI-ARIA combobox — `aria-activedescendant` on the input, a
 * `role="listbox"` under it, arrows to move, Enter to open the highlighted
 * product, Escape to close — and the cost the datalist avoids is paid here,
 * once, in one file.
 *
 * ## What it does not take over
 *
 * The form still submits. Enter with nothing highlighted, or the Apply button,
 * goes to `/store?q=` exactly as it did before suggestions existed, and the
 * last row of the list is that same search — so a suggestion list is a
 * shortcut past the results page, never a replacement for it. A fetch that
 * fails shows nothing and says nothing, the rule `CompanyField` follows.
 *
 * ## Focus stays in the box
 *
 * Options are pressed on `mousedown` with the default prevented, so the input
 * never blurs on the way to a click — a list that closes on blur would
 * otherwise vanish under the pointer before the click landed, which is the
 * classic broken-combobox bug. Blur is then a safe way to close: it only
 * happens when focus genuinely goes somewhere else.
 *
 * Debounced at 250ms and abortable, or a slow answer for "ci" lands after
 * the one for "cisco" and replaces it.
 */
export function StoreSearch({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState(defaultValue ?? "");
  const [results, setResults] = useState<{ rows: StoreSuggestion[]; total: number }>({ rows: [], total: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inFlight = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const query = term.trim();

  useEffect(() => {
    // Below the floor nothing is fetched and nothing is *set* — the list is
    // derived empty at render instead (`suggestions`), which is what keeps a
    // `setState` out of this effect's body.
    if (query.length < 2) return;

    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const response = await fetch(`/api/store/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { data: StoreSuggestion[]; total?: number };
        setResults({ rows: body.data ?? [], total: body.total ?? body.data?.length ?? 0 });
        setActive(-1);
      } catch {
        // A suggestion that does not arrive is not an error anybody can act on.
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      inFlight.current?.abort();
    };
  }, [query]);

  const suggestions = query.length < 2 ? [] : results.rows;
  // The "see all" row is the last option, so the keyboard can reach it.
  const count = suggestions.length + (suggestions.length ? 1 : 0);
  const expanded = open && suggestions.length > 0;

  function choose(index: number) {
    if (index < 0 || index >= count) return;
    setOpen(false);
    if (index === suggestions.length) {
      input.current?.form?.requestSubmit();
      return;
    }
    router.push(`/store/products/${suggestions[index].slug}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      // From nowhere, Down is the first row and Up is the last; otherwise wrap.
      setActive((a) => (a < 0 ? (step > 0 ? 0 : count - 1) : (a + step + count) % count));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  const option = "flex cursor-pointer items-center rounded-md transition-colors";

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-faint">
        <IconSearch className="size-[18px]" />
      </span>
      <input
        ref={input}
        id="q"
        name="q"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        // The placeholder is the cycling span below (Velora's vanish-input);
        // a static one here would sit under it.
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-11 pr-3 text-14-5 transition-all duration-(--duration-base) ease-brand placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
      />
      <CyclingPlaceholder
        active={term === ""}
        placeholders={["Name, part number or brand…", "Try CBS350-24T", "FortiGate 40F", "Wi-Fi 6 access point", "ThinkPad E14"]}
        className="left-11 right-3 text-14-5 text-faint"
      />

      {/*
        Always in the DOM so `aria-controls` points at something; `hidden`
        while closed, which computes to `display: none` and so contributes
        nothing to the audit's overflow or tap-target counts.
      */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching products"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[60vh] overflow-y-auto rounded-lg border border-line-strong bg-card p-1.5 shadow-2"
      >
        {suggestions.map((s, i) => (
          <li
            key={s.slug}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={active === i}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
            className={cn(option, "gap-3 px-2 py-1.5", active === i && "bg-surface-2")}
          >
            <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {s.image ? (
                <Image src={s.image} alt={s.image_alt ?? ""} fill sizes="48px" className="object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-faint"><IconBox className="size-5" /></span>
              )}
            </span>
            {/* `pr-2` so a truncated name ends with its ellipsis short of the row's edge, not on it. */}
            <span className="min-w-0 flex-1 pr-2">
              <span className="block truncate text-14 font-medium text-ink">
                <Highlight text={s.name} term={query} />
              </span>
              <span className="block truncate text-12-5 text-muted">
                {s.brand}
                {s.brand && s.sku && " · "}
                {s.sku && <span className="font-mono">{s.sku}</span>}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-14 font-semibold tabular-nums text-ink">{formatPaise(s.price_paise)}</span>
              {!s.in_stock && <span className="block text-11-5 text-muted">Out of stock</span>}
            </span>
          </li>
        ))}

        {suggestions.length > 0 && (
          <li
            id={`${listId}-${suggestions.length}`}
            role="option"
            aria-selected={active === suggestions.length}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(suggestions.length)}
            onClick={() => choose(suggestions.length)}
            className={cn(option, "mt-1 h-11 justify-center border-t border-line text-13-5 font-semibold text-brand-ink", active === suggestions.length && "bg-surface-2")}
          >
            See all {results.total} result{results.total === 1 ? "" : "s"} for “{query}”
          </li>
        )}
      </ul>
    </div>
  );
}

/** The typed term, emboldened where it occurs in a name. */
function Highlight({ text, term }: { text: string; term: string }) {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-ink">{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length)}
    </>
  );
}
