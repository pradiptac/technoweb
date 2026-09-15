"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconSearch } from "@/components/icons-ui";
import { confirmLeave } from "@/components/admin/form-actions";
import { cn } from "@/lib/utils";

export type PalettePage = { label: string; href: string; group?: string };

type Group = { type: string; label: string; items: { label: string; sub: string | null; admin_path: string }[] };
type Row = { key: string; label: string; sub: string | null; href: string; group: string };

/**
 * The console's command palette: Ctrl/⌘ K, or the search button in the bar.
 *
 * Two sources in one list. The console's own screens — the sidebar's rows,
 * already filtered by role, handed in by the layout as plain `{label, href}`
 * pairs — match client-side from the first character, so "cus" is on
 * Customers before anything has been fetched. Records come from
 * `/api/admin/search` (the API's `/admin/search`, five per group, each group
 * present only for a role that may open it) 200ms after the last keystroke
 * from two characters. Pages first, because a page is what somebody
 * pressing ⌘K usually wants; a record label is a subject or a name, with
 * the reference or the company under it.
 *
 * A `<dialog>` of its own rather than `Modal`, for the reason the gallery's
 * lightbox gives: the input *is* the title, and a heading over a search box
 * is chrome nobody reads. It keeps everything `Modal` is for — the top layer,
 * the focus trap, Escape and the backdrop closing through the element's own
 * `close` event, `dialog-motion` — and adds a listbox under the input with
 * `aria-activedescendant`, so the arrow keys move a highlight the input
 * never loses focus for. Enter opens the highlighted row through the router;
 * a row is also a real link, so a middle-click opens it in a new tab.
 *
 * Nothing here is fetched until it is opened, and the shortcut is ignored
 * while focus is inside a text field with its own ⌘K (the editor) — a
 * shortcut that steals from a control someone is typing in is worse than
 * none.
 */
export function CommandPalette({ pages }: { pages: PalettePage[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<{ q: string; rows: Group[] }>({ q: "", rows: [] });
  const [active, setActive] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  // The shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        const el = document.activeElement as HTMLElement | null;
        if (el?.isContentEditable) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Open and close the element from state; hear the element's own close.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
      input.current?.select();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.addEventListener("close", hide);
    return () => d.removeEventListener("close", hide);
  }, [hide]);

  // Records, debounced, from two characters.
  const query = term.trim();
  useEffect(() => {
    if (!open || query.length < 2) return;
    const timer = setTimeout(async () => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Group[] };
        setGroups({ q: query, rows: body.data ?? [] });
      } catch {
        // A palette that cannot fetch still lists the pages.
      }
    }, 200);
    return () => { clearTimeout(timer); inFlight.current?.abort(); };
  }, [open, query]);

  const lower = query.toLowerCase();
  const pageRows: Row[] = (lower ? pages.filter((p) => p.label.toLowerCase().includes(lower) || (p.group ?? "").toLowerCase().includes(lower)) : pages)
    .slice(0, lower ? 8 : 12)
    .map((p) => ({ key: `page:${p.href}`, label: p.label, sub: p.group ?? null, href: p.href, group: "Go to" }));
  const recordRows: Row[] = query.length >= 2 && groups.q === query
    ? groups.rows.flatMap((g) => g.items.map((i) => ({ key: `${g.type}:${i.admin_path}`, label: i.label, sub: i.sub, href: i.admin_path, group: g.label })))
    : [];
  const rows = [...pageRows, ...recordRows];
  const current = Math.min(active, Math.max(0, rows.length - 1));

  const go = (row: Row) => {
    // A dirty form on the page gets to say no, the way a sidebar link would.
    if (!confirmLeave()) return;
    setOpen(false);
    router.push(row.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && rows[current]) { e.preventDefault(); go(rows[current]); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(rows.length - 1); }
    // Chrome spends the first Escape on a non-empty `type="search"` clearing
    // it and never lets the dialog see it; the palette closes on the first.
    else if (e.key === "Escape") { e.preventDefault(); hide(); }
  };

  // Group headings appear where the group changes.
  let lastGroup = "";

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-keyshortcuts="Control+K Meta+K"
        title="Search the console (Ctrl K)"
        className="flex items-center gap-1.5 rounded border border-line-strong bg-surface-2 px-2 py-1 text-12-5 text-muted transition-colors hover:border-faint hover:text-ink"
      >
        <IconSearch className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-10-5 sm:inline">Ctrl K</kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="Search the console"
        onClick={(e) => { if (e.target === e.currentTarget) hide(); }}
        className={cn(
          "m-auto mt-[10vh] w-[calc(100vw-2rem)] max-w-[34rem] rounded-xl border border-line-strong bg-card p-0 text-ink shadow-float",
          "max-h-[min(30rem,calc(100dvh-4rem))] backdrop:bg-dark/50 backdrop:backdrop-blur-[2px] dialog-motion",
        )}
        data-command-palette
      >
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <IconSearch className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls={listId}
              aria-activedescendant={rows[current] ? `${listId}-${current}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              value={term}
              onChange={(e) => { setTerm(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Type a screen, a ticket reference, a customer, a product…"
              className="min-w-0 flex-1 bg-transparent py-1 text-14 text-ink outline-none placeholder:text-faint"
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-10-5 text-faint">Esc</kbd>
          </div>

          <ul id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto py-1.5">
            {rows.length === 0 && (
              <li className="px-4 py-3 text-13 text-muted" aria-live="polite">
                {query.length >= 2 && groups.q === query ? "Nothing matches that." : "Keep typing — screens match at once, records from two characters."}
              </li>
            )}
            {rows.map((row, i) => {
              const heading = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <li key={row.key} role="presentation">
                  {heading && <p className="px-4 pt-2 pb-1 text-10-5 font-semibold uppercase tracking-[.06em] text-faint">{heading}</p>}
                  <a
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === current}
                    href={row.href}
                    onClick={(e) => { if (!e.metaKey && !e.ctrlKey && e.button === 0) { e.preventDefault(); go(row); } }}
                    onMouseMove={() => { if (i !== current) setActive(i); }}
                    className={cn(
                      "mx-1.5 flex items-baseline gap-2 rounded-md px-2.5 py-1.5 text-13-5",
                      i === current ? "bg-brand-50 text-brand-ink" : "text-ink",
                    )}
                  >
                    <span className="min-w-0 truncate font-medium">{row.label}</span>
                    {row.sub && <span className="min-w-0 truncate text-12 text-muted">{row.sub}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
