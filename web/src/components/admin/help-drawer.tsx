"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { Modal } from "@/components/ui/modal";
import { Prose } from "@/components/ui/prose";

type Section = { id: string; title: string; chapterTitle: string; html: string };
type Result = { id: string; title: string; chapterTitle: string; excerpt: string };
type ScreenHelp = { sections: Section[]; tour: string | null; chapter: { id: string; title: string } | null };

/**
 * The console's "?" (docs/help-and-tours.md): this screen's manual sections
 * in a side sheet, a search over every section, links between sections and
 * "Open this chapter" shown in place with a Back button, and the screen's
 * tour. Everything is fetched from `/api/admin/help` when the sheet opens —
 * the manual is never in a page's JavaScript.
 *
 * The `?` key opens it unless focus is in a field, where it types a
 * question mark. `tw:help` on `window` opens it from elsewhere (detail
 * `{section?}`); "Take the tour" dispatches `tw:tour-start`.
 *
 * The section HTML is injected as is: it is built from the repository's own
 * manual by a converter that escapes everything first
 * (scripts/help-convert.mjs, pinned by its self-check).
 */
export function HelpDrawer() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ScreenHelp | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  // What is shown instead of the screen's sections: a stack, so Back works.
  const [stack, setStack] = useState<Section[][]>([]);
  const button = useRef<HTMLButtonElement>(null);

  const ask = useCallback(async <T,>(query: string): Promise<T | null> => {
    const res = await fetch(`/api/admin/help?${query}`, { cache: "no-store" }).catch(() => null);
    return res?.ok ? ((await res.json()) as T) : null;
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const got = await ask<ScreenHelp>(`path=${encodeURIComponent(path)}&search=${encodeURIComponent(search)}`);
    if (got) setData(got);
    else setFailed(true);
  }, [ask, path, search]);

  const openSection = useCallback(async (id: string) => {
    const got = await ask<{ section: Section | null }>(`section=${encodeURIComponent(id)}`);
    if (got?.section) setStack((s) => [...s, [got.section!]]);
  }, [ask]);

  const openChapter = useCallback(async (id: string) => {
    const got = await ask<{ sections: Section[] }>(`chapter=${encodeURIComponent(id)}`);
    if (got?.sections.length) setStack((s) => [...s, got.sections]);
  }, [ask]);

  const show = useCallback(() => {
    setStack([]);
    setQ("");
    setResults(null);
    setData(null);
    setOpen(true);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      if (document.querySelector("dialog[open], [data-tour-card]")) return;
      e.preventDefault();
      show();
    };
    const onOpen = (e: Event) => {
      show();
      const id = (e as CustomEvent<{ section?: string }>).detail?.section;
      if (id) void openSection(id);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tw:help", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tw:help", onOpen);
    };
  }, [show, openSection]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(async () => {
      const got = await ask<{ results: Result[] }>(`q=${encodeURIComponent(term)}`);
      setResults(got?.results ?? []);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, ask]);

  const onLinkClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-help-link]");
    if (!a?.dataset.helpLink) return;
    e.preventDefault();
    void openSection(a.dataset.helpLink);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const searching = q.trim().length >= 2;
  const shown = stack.length ? stack[stack.length - 1]! : (data?.sections ?? []);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Help for this screen"
        title="Help (?)"
        onClick={show}
        data-tour="help"
        // From `sm`: the bar is full on a phone, where the account menu
        // carries "Help for this screen" instead.
        className="hidden size-8 shrink-0 place-items-center rounded-full border border-line-strong text-13 font-semibold text-muted transition-colors hover:border-faint hover:text-ink sm:grid"
      >
        ?
      </button>
      <Modal open={open} onClose={close} title="Help" size="side" dataAttr="help-drawer">
        <div className="grid gap-4">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setResults(null);
            }}
            placeholder="Search the manual"
            aria-label="Search the manual"
            className="w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-14 text-ink placeholder:text-faint focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />

          {!searching && stack.length > 0 && (
            <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="justify-self-start text-13 font-semibold text-brand-ink hover:underline">
              Back
            </button>
          )}

          {failed && !searching && (
            <p className="text-13 text-err">
              Help could not be loaded.{" "}
              <button type="button" onClick={() => void load()} className="font-semibold underline">Retry</button>
            </p>
          )}

          {searching ? (
            results === null ? (
              <p className="text-13 text-muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-13 text-muted">Nothing in the manual matches “{q.trim()}”.</p>
            ) : (
              <ul className="grid gap-2">
                {results.map((r) => (
                  <li key={r.id} data-help-result>
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        setResults(null);
                        void openSection(r.id);
                      }}
                      className="w-full rounded-lg border border-line-strong bg-card p-3 text-left transition-colors hover:border-brand-ink/30"
                    >
                      <span className="block text-13-5 font-semibold text-ink">{r.title}</span>
                      <span className="block text-12 text-muted">{r.chapterTitle}</span>
                      <span className="mt-1 block text-12-5 text-ink-2">{r.excerpt}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !data && !failed && !stack.length ? (
            <div className="grid gap-2" aria-hidden>
              {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}
            </div>
          ) : (
            <div onClick={onLinkClick} className="grid gap-6">
              {shown.length === 0 && !failed && (
                <p className="text-13 text-muted">No help for this screen yet. Search the manual above.</p>
              )}
              {shown.map((s) => (
                <section key={s.id}>
                  <p className="text-12 text-muted">{s.chapterTitle}</p>
                  <h3 className="font-display text-17 font-semibold text-ink">{s.title}</h3>
                  <Prose
                    html={s.html}
                    className="mt-2 text-[14px] leading-[1.6] [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h4]:text-[14px] [&_p]:mb-3 [&_table]:text-13 [&_td]:border-t [&_td]:border-line [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pr-3 [&_th]:text-left"
                  />
                </section>
              ))}
            </div>
          )}

          {!searching && !stack.length && data && (data.tour || data.chapter) && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {data.tour && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent("tw:tour-start", { detail: { id: data.tour } }));
                  }}
                  className="rounded-full bg-brand-600 px-4 py-2 text-13-5 font-semibold text-brand-on"
                >
                  Take the tour
                </button>
              )}
              {data.chapter && (
                <button
                  type="button"
                  onClick={() => void openChapter(data.chapter!.id)}
                  className="rounded-full border border-line-strong px-4 py-2 text-13-5 font-semibold text-ink hover:border-faint"
                >
                  Open the chapter: {data.chapter.title}
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
