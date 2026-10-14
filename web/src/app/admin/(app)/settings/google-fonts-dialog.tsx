"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Row = { family: string; slug: string; category: string; subsets: string[]; installed: boolean };
type Catalogue = { data: Row[]; meta: { total: number; categories: string[] } };

const SAMPLE = "The quick brown fox — आपका स्वागत है";

const CATEGORY_LABELS: Record<string, string> = {
  "sans-serif": "Sans serif", serif: "Serif", display: "Display", handwriting: "Handwriting", monospace: "Monospace",
};

/**
 * Browse Google Fonts (0.179.0, docs/theming.md "Google fonts").
 *
 * Searches the API's committed catalogue, shows each family as a sample line
 * in its own face, and installs the one pressed — the server downloads it
 * from Google once and serves it from this site's own origin. The samples
 * come through this server too (`/api/admin/google-fonts/preview/<slug>`),
 * so even in the console a visitor's browser — yours — never contacts Google.
 *
 * A sample loads only when its card scrolls into view: the catalogue is
 * ~1,900 families and a page of forty must not fetch forty files at once.
 */
export function GoogleFontsDialog({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (font: { id: string; family: string; slug: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(nextPage) });
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);

    const res = await fetch(`/api/admin/google-fonts?${params}`, { cache: "no-store" }).catch(() => null);
    setLoading(false);

    if (!res?.ok) {
      setError("The font list could not be loaded. Try again shortly.");
      return;
    }

    const got = (await res.json()) as Catalogue;
    setError(null);
    setTotal(got.meta.total);
    setPage(nextPage);
    setRows((prev) => (append ? [...prev, ...got.data] : got.data));
  }, [q, category]);

  // A new search starts again from the first page, once typing pauses.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(1, false), 250);
    return () => clearTimeout(timer);
  }, [open, load]);

  const install = async (row: Row) => {
    setBusy(row.slug);
    setError(null);

    const res = await fetch("/api/admin/google-fonts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: row.slug }),
    }).catch(() => null);

    setBusy(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { message?: string } | null;
      // A toast behind a <dialog> is inert and unseen, so the refusal is drawn inside it.
      setError(body?.message ?? "That font could not be installed. Try again shortly.");
      return;
    }

    onPick({ id: `g-${row.slug}`, family: row.family, slug: row.slug });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Google Fonts" size="lg">
      <p className="measure mb-3 text-13 text-muted">
        Choosing a font copies it to this site once. Visitors are sent your own copy, never Google&rsquo;s, so no
        cookie banner or privacy note is involved. Noto covers Hindi, Bengali, Tamil and the other Indian scripts.
      </p>

      <div className="sticky top-0 z-1 -mx-1 flex flex-wrap gap-2 bg-card px-1 pb-3">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, e.g. Noto Sans Bengali, Poppins…"
          aria-label="Search Google Fonts"
          className="field h-11 min-w-0 flex-1 rounded border border-line-strong bg-card px-3 text-13-5"
        />
        <Select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 w-auto"
        >
          <option value="">All styles</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      {error && <Alert tone="err" title="Could not do that" dismissible={false}>{error}</Alert>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <FontCard key={row.slug} row={row} busy={busy === row.slug} disabled={busy !== null} onInstall={() => void install(row)} />
        ))}
      </ul>

      {!loading && rows.length === 0 && !error && <p className="py-6 text-center text-13 text-muted">No font matches that.</p>}

      {rows.length < total && (
        <div className="mt-3 text-center">
          <Button type="button" variant="secondary" size="sm" pending={loading} onClick={() => void load(page + 1, true)}>
            Show more ({total - rows.length} left)
          </Button>
        </div>
      )}
    </Modal>
  );
}

function FontCard({ row, busy, disabled, onInstall }: { row: Row; busy: boolean; disabled: boolean; onInstall: () => void }) {
  const card = useRef<HTMLLIElement>(null);
  const [family, setFamily] = useState<string | null>(null);

  // Load the sample when the card is first on screen; the FontFace API keeps
  // it under a name of ours (`tw-prev-<slug>`), never Google's.
  useEffect(() => {
    const el = card.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();

      const name = `tw-prev-${row.slug}`;
      const face = new FontFace(name, `url(/api/admin/google-fonts/preview/${row.slug})`);
      face.load().then((loaded) => {
        document.fonts.add(loaded);
        setFamily(name);
      }).catch(() => {});
    }, { rootMargin: "120px" });

    seen.observe(el);
    return () => seen.disconnect();
  }, [row.slug]);

  return (
    <li ref={card} className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border border-line-strong bg-card p-3">
      <div className="min-w-0">
        <p className="truncate text-13 font-semibold">{row.family}</p>
        <p className="mb-1 text-12 text-muted">{CATEGORY_LABELS[row.category] ?? row.category}</p>
        <p
          className="truncate text-17 leading-snug"
          style={{ fontFamily: family ? `"${family}", ui-sans-serif, system-ui, sans-serif` : undefined }}
          aria-label={`${row.family} sample`}
        >
          {SAMPLE}
        </p>
      </div>
      <Button type="button" size="sm" variant={row.installed ? "secondary" : "primary"} pending={busy} disabled={disabled} onClick={onInstall}>
        {row.installed ? "Use" : "Install and use"}
      </Button>
    </li>
  );
}
