"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { VanishInput } from "@/components/velora/vanish-input";
import { cn } from "@/lib/utils";

type Group = { type: string; label: string; total: number; items: { title: string; path: string }[] };

/**
 * The header's search box with suggestions under it.
 *
 * `/search` has always answered grouped results — products, guides,
 * solutions — in one call, part numbers first; the box submitted and waited
 * for a page. This draws those results as they are typed: three per group,
 * a "See all N results" row last, arrow keys down the list, Enter follows
 * the highlighted row, Escape closes. The pattern is the shop's
 * `store-search.tsx` — a `role="listbox"` and not a `<datalist>`, for the
 * reasons that file gives — with the rows grouped because the results are.
 *
 * It is a shortcut past the results page and never a replacement for it:
 * with nothing highlighted Enter is the form's own GET to `/search`, exactly
 * as before, so the box works before hydration and the URL stays shareable.
 * A fetch that fails is a box that behaves as it always did.
 *
 * The list is `absolute` under the pill, in the page's own colours rather
 * than the top bar's — it is a piece of the page opening, not the strip
 * unfolding, and its rows are the site's links. Right-anchored on wide
 * screens, since the box sits toward the right of the strip.
 */
export function SiteSearch({ className, inputClassName, buttonClassName, placeholders }: {
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  placeholders: string[];
}) {
  const router = useRouter();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<{ q: string; groups: Group[]; total: number }>({ q: "", groups: [], total: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inFlight = useRef<AbortController | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const query = term.trim();

  useEffect(() => {
    if (query.length < 2) return;

    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { data: Group[]; total?: number };
        setGroups({ q: query, groups: body.data ?? [], total: body.total ?? 0 });
        setActive(-1);
      } catch {
        // Nothing a reader can act on; the form still submits.
      }
    }, 250);

    return () => { clearTimeout(timer); inFlight.current?.abort(); };
  }, [query]);

  // Derived, never set: below the floor there is nothing to show, and a list
  // for a term that has since changed is stale.
  const shown = query.length >= 2 && groups.q === query ? groups.groups : [];
  const flat = shown.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
  const count = flat.length + (flat.length ? 1 : 0);
  const expanded = open && flat.length > 0;

  function choose(index: number) {
    if (index < 0 || index >= count) return;
    setOpen(false);
    if (index === flat.length) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      return;
    }
    router.push(flat[index].path);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (step > 0 ? 0 : count - 1) : (a + step + count) % count));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Closes on a click outside; the input's own blur cannot be used, because
  // a click on a row blurs the input before the row's click lands.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  let row = -1;

  return (
    <div ref={host} className="relative">
      <VanishInput
        id="header-q"
        name="q"
        action="/search"
        label="Search the site"
        placeholders={placeholders}
        className={className}
        inputClassName={inputClassName}
        buttonClassName={buttonClassName}
        onValueChange={(v) => { setTerm(v); setOpen(true); }}
        onKeyDown={onKeyDown}
        inputProps={{
          role: "combobox",
          "aria-expanded": expanded,
          "aria-controls": listId,
          "aria-autocomplete": "list",
          "aria-activedescendant": expanded && active >= 0 ? `${listId}-${active}` : undefined,
          autoComplete: "off",
          onFocus: () => setOpen(true),
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className={cn(
            "absolute right-0 top-full z-50 mt-1.5 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line-strong bg-card p-1.5 text-13-5 text-ink shadow-2",
            !expanded && "hidden",
          )}
        >
          {shown.map((g) => (
            <div key={g.type} className="py-1">
              <p className="px-2.5 pb-1 text-11 font-semibold uppercase tracking-[.08em] text-faint">{g.label}</p>
              {g.items.map((item) => {
                const index = ++row;
                return (
                  <div
                    key={item.path}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={active === index}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      "cursor-pointer rounded-md px-2.5 py-1.5 transition-colors",
                      active === index ? "bg-brand-50 text-ink" : "hover:bg-surface-2",
                    )}
                  >
                    {item.title}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length > 0 && (
            <div
              id={`${listId}-${flat.length}`}
              role="option"
              aria-selected={active === flat.length}
              onPointerEnter={() => setActive(flat.length)}
              onClick={() => choose(flat.length)}
              className={cn(
                "mt-1 cursor-pointer rounded-md border-t border-line px-2.5 py-2 font-semibold text-brand-ink transition-colors",
                active === flat.length ? "bg-brand-50" : "hover:bg-surface-2",
              )}
            >
              See all {groups.total} result{groups.total === 1 ? "" : "s"} for “{query}”
            </div>
          )}
        </div>
      </VanishInput>
    </div>
  );
}
