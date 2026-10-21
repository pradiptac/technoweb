"use client";

import { useEffect, useState } from "react";

import { isAnyFormDirty } from "@/components/admin/form-actions";
import { Alert } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import type { RevisionType } from "@/types/revisions";

type Presence = { others: { name: string; dirty: boolean; since: string | null }[]; saved: { at: string | null; by: string | null } };

const EVERY_MS = 20_000;

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The sentences the strip shows, newest save first; pure, so the wording is one place. */
export function presenceSentences(p: Presence | null, base: string | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  const saved = p.saved.at ? Date.parse(p.saved.at) : NaN;
  const opened = base ? Date.parse(base) : NaN;
  if (!Number.isNaN(saved) && !Number.isNaN(opened) && Math.floor(saved / 1000) > Math.floor(opened / 1000)) {
    out.push(`${p.saved.by ?? "Somebody"} saved a newer version at ${formatDate(p.saved.at, "time")}. Reload to see it — your save will ask before overwriting.`);
  }
  const editing = p.others.filter((o) => o.dirty).map((o) => o.name);
  const open = p.others.filter((o) => !o.dirty).map((o) => o.name);
  if (editing.length) out.push(`${names(editing)} ${editing.length === 1 ? "is" : "are"} also editing this — unsaved changes.`);
  if (open.length) out.push(`${names(open)} ${open.length === 1 ? "has" : "have"} this open.`);
  return out;
}

/**
 * Who else has this record open, and whether it was saved since it was
 * loaded (C2, docs/notifications.md). Beats every 20 seconds while the tab is
 * visible, at once when it comes back, and says goodbye on `pagehide`. A
 * failed beat keeps the last answer, so a dropped connection never claims the
 * screen is yours alone. The status region is mounted empty and stays
 * mounted, so a change is announced.
 */
export function EditPresence({ type, id, base }: { type: RevisionType; id: number; base: string | null }) {
  const [presence, setPresence] = useState<Presence | null>(null);

  useEffect(() => {
    let stopped = false;
    /*
     * "Unsaved changes" means somebody typed — a trusted input or change inside
     * a form since the page loaded or last saved. The leave guard's own dirty
     * flag is not enough on its own: an editor that normalises its value on
     * mount (the page body) sets it with nobody at the keyboard, and colleagues
     * would be told of changes that do not exist.
     */
    let typed = false;
    const onInput = (e: Event) => { if (e.isTrusted && (e.target as Element | null)?.closest?.("form")) typed = true; };
    const onSubmit = () => { typed = false; };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/admin/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, dirty: typed && isAnyFormDirty() }),
      }).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { data?: Presence } | null) : null;
      if (!stopped && body?.data && Array.isArray(body.data.others)) setPresence(body.data);
    };
    const leave = () => navigator.sendBeacon?.("/api/admin/presence", JSON.stringify({ type, id, leave: true }));
    const onVisible = () => { if (document.visibilityState === "visible") void beat(); };

    void beat();
    const timer = window.setInterval(beat, EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [type, id]);

  const lines = presenceSentences(presence, base);

  return (
    <div role="status" data-edit-presence>
      {lines.length > 0 && (
        <Alert tone="info" title={lines[0]!} dismissible={false}>
          {lines.length > 1 ? lines.slice(1).map((l) => <p key={l}>{l}</p>) : null}
        </Alert>
      )}
    </div>
  );
}
