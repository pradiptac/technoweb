"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MaterialIcon } from "@/components/material-icon";

/**
 * Search and choose a Google icon (0.179.0, docs/icons.md): a box, a grid of
 * 120, and "Show more". The names come from `/api/admin/icons/material`, so
 * nothing but this grid's own code is in the browser; each tile is drawn from
 * our own icon file, which the browser keeps for a year.
 *
 * Imports `MaterialIcon` from its own module, not `icons.tsx`: the page
 * editor mounts this, and `icons.tsx` carries the whole site icon map.
 */
export function MaterialIconGrid({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    const res = await fetch(`/api/admin/icons/material?${new URLSearchParams({ q: q.trim(), page: String(nextPage) })}`, { cache: "no-store" }).catch(() => null);
    setLoading(false);

    if (!res?.ok) {
      setFailed(true);
      return;
    }

    const got = (await res.json()) as { data: string[]; meta: { total: number } };
    setFailed(false);
    setTotal(got.meta.total);
    setPage(nextPage);
    setNames((prev) => (append ? [...prev, ...got.data] : got.data));
  }, [q]);

  // A new search starts again from the first page, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => void load(1, false), 200);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div>
      <div className="sticky top-0 z-1 -mx-1 bg-card px-1 pb-3">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Google icons, e.g. router, shield, support…"
          aria-label="Search Google icons"
          className="field h-11 w-full rounded border border-line-strong bg-card px-3 text-13-5"
        />
      </div>

      {failed && <p role="status" className="py-4 text-center text-13 text-err">The icons could not be loaded. Try again shortly.</p>}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
        {names.map((n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => onPick(n)}
              aria-label={n.replace(/_/g, " ")}
              className="flex h-[84px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-line px-1.5 text-ink transition-colors duration-(--duration-base) hover:border-brand-300 hover:bg-surface"
            >
              <MaterialIcon name={n} className="size-[22px]" />
              <span className="w-full truncate text-center text-11-5 text-muted">{n.replace(/_/g, " ")}</span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && !failed && names.length === 0 && <p className="py-8 text-center text-13 text-faint">No icon matches “{q}”.</p>}

      {names.length < total && (
        <div className="mt-3 text-center">
          <Button type="button" variant="secondary" size="sm" pending={loading} onClick={() => void load(page + 1, true)}>
            Show more ({total - names.length} left)
          </Button>
        </div>
      )}
    </div>
  );
}
