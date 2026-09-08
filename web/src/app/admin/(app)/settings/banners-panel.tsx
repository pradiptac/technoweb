"use client";

import { CoverField } from "@/components/admin/cover-field";
import type { SettingGroups } from "@/lib/admin";

/**
 * The page banners, drawn as a grid of cards.
 *
 * A panel of its own for the same reason mail and payments have one: the
 * generic renderer flows a group's fields into a two-column grid, and that
 * arrangement cannot draw this group tidily. Nine image pickers and one
 * one-character toggle went into the same flow, so the toggle took a whole
 * cell and left a picker-sized hole beside it, and every row was as tall as
 * whichever of its two cells was taller. It also repeated the uploader's
 * three-line size hint **nine times** and rendered each field's own
 * explanation *after* the control with a negative margin pulling it back up.
 *
 * The rows still come from the same API response and still carry `setting__`
 * names, so this saves through the same action as everything else on the
 * screen.
 *
 * The size advice is stated **once**, above the grid, rather than under every
 * picker: nine identical paragraphs are nine things to read past to find the
 * one line that differs.
 */

/**
 * Which pages each banner dresses, in navigation order with the fallback
 * first.
 *
 * The list is here rather than derived from the keys because the useful half
 * is the *pages*, and a key cannot say them — `banner_company_path` does not
 * tell an editor that it is about to change the Careers page. Ordered to match
 * the site's own navigation so the panel reads like the menu it decorates.
 */
const SECTIONS: { key: string; label: string; pages: string }[] = [
  { key: "banner_default_path", label: "Default banner", pages: "Every section with nothing of its own — one upload dresses the whole site." },
  { key: "banner_solutions_path", label: "Solutions", pages: "/solutions and every solution page." },
  { key: "banner_products_path", label: "Products", pages: "/products, every category and product page, and /brands." },
  { key: "banner_services_path", label: "Web Services", pages: "/services and every service page." },
  { key: "banner_industries_path", label: "Industries", pages: "/industries and every industry page." },
  { key: "banner_store_path", label: "Store", pages: "Store product and category pages. The shop's own front page has its hero slider instead." },
  { key: "banner_support_path", label: "Support", pages: "/support." },
  { key: "banner_resources_path", label: "Resources", pages: "/resources, the blog, case studies and the knowledge base." },
  { key: "banner_company_path", label: "Company", pages: "About, Contact, Careers and the location pages." },
];

export function BannersPanel({ rows }: { rows: SettingGroups[string] }) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const enabled = byKey.get("banner_enabled");

  return (
    <div>
      {/*
        The switch and the size advice on one strip, above the pictures.

        In the generic flow the switch was a full-width text box occupying a
        cell meant for an image picker, with the tallest empty space on the
        screen beside it. It is one character, so it gets the width of one.
      */}
      {enabled && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line-strong bg-surface px-4 py-3">
          <label htmlFor="setting__banner_enabled" className="text-[13.5px] font-semibold">
            Show page banners
          </label>
          {/*
            A plain input, not a checkbox, because every other boolean on this
            screen is one — `store_promo_enabled`, `newsletter_tracking_enabled`
            and the rest all take 1 or 0. Inventing a switch for this one group
            would make the screen inconsistent with itself, which is a worse
            trade than the box being unfashionable.
          */}
          <input
            id="setting__banner_enabled"
            name="setting__banner_enabled"
            defaultValue={enabled.value ?? "1"}
            inputMode="numeric"
            className="h-9 w-14 rounded border border-line-strong bg-card px-2 text-center text-[14px] transition-all duration-200 ease-brand focus:border-brand-400 focus:outline-none focus:ring-3 focus:ring-brand-100"
          />
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">
            1 to show them, 0 to hide them all without clearing the pictures below.
          </p>
        </div>
      )}

      <p className="measure mb-4 text-[12.5px] text-muted">
        PNG, JPG or WebP, landscape and wide — around 2000 &times; 560 px. Each one is
        dimmed automatically so the heading stays legible over it, so choose for
        composition rather than for brightness.
      </p>

      {/*
        Two columns, not three. Each card holds a `CoverField`, whose own
        preview-and-controls pair splits at `sm` — a third column would leave
        each half around 180px, narrower than the words on its own button.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ key, label, pages }) => {
          const row = byKey.get(key);
          if (!row) return null;

          return (
            <div key={key} className="rounded-lg border border-line-strong bg-surface p-3.5">
              <CoverField
                name={`setting__${key}`}
                label={label}
                description={pages}
                defaultPath={row.value}
                defaultUrl={row.url ?? null}
                accept=".png,.jpg,.jpeg,.webp"
                /*
                  Empty, deliberately: the advice is on the strip above and is
                  the same for all nine. FileDrop renders no line at all rather
                  than an empty one.
                */
                hint=""
                /* The card supplies the spacing. */
                className="mb-0"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
