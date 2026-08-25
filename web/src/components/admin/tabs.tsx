"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type TabDef = {
  id: string;
  label: string;
  badge?: number | string;
  /** "err" renders the badge as a problem count rather than a neutral total. */
  tone?: "err";
};

/**
 * Tabs for long forms and the settings screen.
 *
 * **Every panel stays mounted.** Inactive ones are hidden with the `hidden`
 * attribute, never unmounted. This is not a preference: these tabs sit inside
 * a single form, and an unmounted panel takes its inputs out of the DOM — so
 * saving from tab one would silently drop everything on tabs two, three and
 * four.
 *
 * This project has already shipped that bug once. The SEO panel used to
 * unmount when collapsed, and every post saved with it closed quietly dropped
 * out of sitemap.xml. Same mechanism, worse blast radius here.
 *
 * State is local rather than in the URL for the same reason: a URL-driven tab
 * is a navigation, and navigating away from a half-filled form loses it.
 */
export function Tabs({
  tabs, children, className, jumpTo, jumpNonce,
}: {
  tabs: TabDef[];
  /** One child per tab, in the same order. */
  children: React.ReactNode[];
  className?: string;
  /**
   * Tab to jump to when `jumpNonce` changes — pass the id of the first panel
   * holding a validation error, and the action state as the nonce.
   *
   * Without this a 422 on a hidden panel is invisible: the form says "could
   * not save" and every field the editor can see looks fine. Hiding a panel
   * must not hide the reason a save failed.
   */
  jumpTo?: string | null;
  jumpNonce?: unknown;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();

  // Adjusting state during render rather than in an effect: this re-renders
  // once before paint, so the correct tab is the first thing shown instead of
  // the wrong one flashing.
  const [seenNonce, setSeenNonce] = useState(jumpNonce);
  if (jumpNonce !== seenNonce) {
    setSeenNonce(jumpNonce);
    if (jumpTo && jumpTo !== active && tabs.some((t) => t.id === jumpTo)) setActive(jumpTo);
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Sections"
        className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-line"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 rounded-t border-b-2 px-3 py-2 text-[13px] transition-colors",
                selected
                  // A 2px rule under one of ten tabs is easy to miss on a
                  // wide screen. Weight and a tinted ground carry it as well.
                  ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
                  : "border-transparent font-medium text-muted hover:border-line-strong hover:bg-surface-2 hover:text-ink",
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge !== 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold",
                    tab.tone === "err" ? "bg-err-soft text-err" : "bg-surface-2 text-muted",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          // `hidden`, not conditional rendering — see the note above.
          hidden={tab.id !== active}
        >
          {children[i]}
        </div>
      ))}
    </div>
  );
}
