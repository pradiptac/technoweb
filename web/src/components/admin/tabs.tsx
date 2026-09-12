"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type TabDef = {
  id: string;
  label: string;
  badge?: number | string;
  /** "err" renders the badge as a problem count rather than a neutral total. */
  tone?: "err";
  /**
   * The heading this tab sits under, which turns the strip into two levels.
   *
   * Optional, and **the strip is unchanged when no tab carries one** — which
   * is every caller but Settings. It exists because twenty tabs do not
   * overflow, they *wrap*: measured at two rows on a desktop, three at 1024px
   * and **six rows, 230px, on a phone**, which put the first field 528px down
   * the viewport. Nothing in `npm run audit` fails for that, so it had to be
   * measured by hand.
   *
   * The label is the identity — there is no separate id and no second prop
   * listing the sections, because a list of section keys beside a list of tabs
   * is two hand-written lists that have to agree, which is the drift this
   * project keeps being bitten by. Order is first appearance in `tabs`.
   */
  section?: string;
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
 *
 * `?tab=` is read **once**, as the starting panel, and never written. That is
 * a different thing from driving the tabs from the URL — clicking between them
 * still costs nothing and still cannot lose what has been typed — and it is
 * what lets a link point at the panel it means. The SEO overview needs it:
 * "go and fix this title" that lands on the Content tab of a nine-field form
 * has pointed at the record and not at the problem.
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
  // A tab id the URL asked for, honoured only if it names a real panel — a
  // stale link should open the form, not an empty one.
  const requested = useSearchParams().get("tab");
  const [active, setActive] = useState(
    tabs.some((t) => t.id === requested) ? requested! : tabs[0]?.id,
  );
  const base = useId();

  // Adjusting state during render rather than in an effect: this re-renders
  // once before paint, so the correct tab is the first thing shown instead of
  // the wrong one flashing.
  const [seenNonce, setSeenNonce] = useState(jumpNonce);
  if (jumpNonce !== seenNonce) {
    setSeenNonce(jumpNonce);
    if (jumpTo && jumpTo !== active && tabs.some((t) => t.id === jumpTo)) setActive(jumpTo);
  }

  /*
   * The sections, in the order they first appear. Empty for every caller that
   * passes none, and `grouped` is false there — so the markup below is exactly
   * what it has always been for the other fifteen forms.
   */
  const sections = [...new Set(tabs.map((t) => t.section).filter(Boolean))] as string[];
  const grouped = sections.length > 0;
  const activeSection = tabs.find((t) => t.id === active)?.section;

  return (
    <div className={className}>
      {grouped && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {sections.map((section) => {
            const owned = tabs.filter((t) => t.section === section);
            const selected = section === activeSection;

            /*
             * A section carries its tabs' badges, because a validation error
             * two levels down is one nobody can see. Settings passes no badges
             * today and `buildFormTabs` passes no sections, so this is dormant
             * — and it is written anyway, because the day the two meet the
             * failure is a form that says "could not save" over a screen where
             * every visible field is fine, which this project has shipped once
             * already.
             */
            const count = owned.reduce(
              (n, t) => n + (typeof t.badge === "number" ? t.badge : t.badge ? 1 : 0), 0,
            );
            const bad = owned.some((t) => t.tone === "err" && t.badge);

            return (
              <button
                key={section}
                type="button"
                aria-pressed={selected}
                // Selecting a section shows its first panel, so the heading on
                // screen and the panel under it can never disagree.
                onClick={() => setActive(owned[0].id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  selected
                    ? "bg-brand-600 font-semibold text-brand-on"
                    : "bg-surface-2 font-medium text-muted hover:text-ink",
                )}
              >
                {section}
                {count > 0 && (
                  /*
                    The same two pairings the tab badges below use, and
                    deliberately not a third one for the selected chip. That
                    was `bg-white/20 text-white` — a translucent stop over
                    `brand-600`, which is the trap the slide caption, the
                    popup's close button and `text-white/85` have each sprung
                    already, and this one could not be caught: no caller passes
                    both a section and a badge today, so it renders on no
                    audited route. Reachable only from a state nothing
                    exercises is exactly where 1.53:1 alerts and a 2.4:1 button
                    lived for months.
                  */
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] font-semibold",
                      bad ? "bg-err-soft text-err" : "bg-surface-2 text-muted",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
              /*
                Hidden rather than dropped from the list. Every panel keeps
                `aria-labelledby` pointing at its own tab, so removing the ones
                outside the open section would leave fourteen panels labelled
                by an element that is not in the document.
              */
              hidden={grouped && tab.section !== activeSection}
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
