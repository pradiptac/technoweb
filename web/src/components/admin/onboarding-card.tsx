"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Ring } from "@/components/ui/ring";
import { IconArrowRight, IconCheck } from "@/components/icons-ui";
import { cn } from "@/lib/utils";
import type { Onboarding } from "@/types/api";

/**
 * "Getting started" on the dashboard (2026-10-05): what this install still
 * has to do before it is the client's own site, each step answered by the
 * API from real state (`App\Support\Onboarding`), never ticked by hand.
 *
 * Folding it away is this browser's decision, kept in `localStorage` and read
 * through `useSyncExternalStore` with a server snapshot of "open", so the
 * first paint matches the server and a folded card never flashes open — the
 * consent banner's pattern. Folded, it is one line with the count, so the
 * outstanding work is never out of sight; when every step is done the page
 * stops rendering it at all.
 *
 * Outstanding steps first: the list is read top down, and a done step is
 * news nobody needs twice.
 */
const KEY = "tw_onboarding_folded";
const EVENT = "tw:onboarding";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}
const folded = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const setFolded = (v: boolean) => {
  try { if (v) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private window */ }
  window.dispatchEvent(new Event(EVENT));
};

export function OnboardingCard({ data }: { data: Onboarding }) {
  const isFolded = useSyncExternalStore(subscribe, folded, () => false);
  const pct = Math.round((data.done / Math.max(1, data.total)) * 100);
  const steps = [...data.steps].sort((a, b) => Number(a.done) - Number(b.done));

  if (isFolded) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-strong bg-card px-4 py-2.5">
        <Ring value={pct} size={28} strokeWidth={4} className="text-brand-ink" />
        <p className="text-13 text-ink-2">
          <span className="font-semibold text-ink">Getting started</span> · {data.done} of {data.total} done
        </p>
        <button type="button" onClick={() => setFolded(false)} className="ml-auto min-h-7 rounded-md px-2 text-12-5 font-semibold text-brand-ink hover:bg-surface-2">
          Show the checklist
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="onboarding-title" className="mb-4 overflow-hidden rounded-lg border border-line-strong bg-card">
      <div className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-3.5 sm:px-5">
        <Ring value={pct} size={52} strokeWidth={5} className="text-brand-ink">
          <span className="text-12 font-semibold tabular-nums text-ink">{pct}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <h2 id="onboarding-title" className="text-15 font-semibold">Getting started</h2>
          <p className="text-12-5 text-muted">
            {data.done} of {data.total} done. Each step ticks itself once the sample it names has been replaced.
          </p>
        </div>
        <button type="button" onClick={() => setFolded(true)} className="min-h-8 rounded-md px-2.5 text-12-5 font-semibold text-muted hover:bg-surface-2 hover:text-ink">
          Fold away
        </button>
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
        {steps.map((s) => (
          <li key={s.key} className="sm:border-b sm:border-line sm:odd:border-r">
            <Link
              href={s.href}
              className={cn(
                "group flex items-start gap-3 px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-surface-2 sm:px-5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                  s.done ? "border-ok bg-ok text-ok-soft" : "border-line-strong",
                )}
              >
                {s.done && <IconCheck className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-13-5 font-semibold", s.done ? "text-muted line-through decoration-1" : "text-ink")}>
                  {s.label}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
                {!s.done && s.hint && <span className="mt-0.5 block text-12-5 text-muted">{s.hint}</span>}
              </span>
              {!s.done && <IconArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-faint transition-[translate] duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-brand-ink" />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
