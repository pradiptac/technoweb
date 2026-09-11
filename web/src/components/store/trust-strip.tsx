import type { CSSProperties } from "react";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { storeTrustFeatures } from "@/content/site";
import { formatPaise } from "@/lib/money";
import { getSiteSettings } from "@/lib/settings";

/**
 * The store homepage's 4-icon trust strip.
 *
 * Three of the four are static — see the note on `storeTrustFeatures` in
 * `content/site.ts`. The delivery card is built from `store_shipping_paise`,
 * because it is the one claim on this strip that a machine also reads: the
 * Google shopping feed and the Offer markup declare the same figure, and the
 * three must not disagree. Async and reading the settings itself, which is
 * free — `getSiteSettings` is a tagged fetch Next dedupes within a render, the
 * same call `PageHero` makes for the banners.
 *
 * Each item is a bordered card rather than bare text on the page. Unboxed, four
 * short blocks spread across a full-width row read as loose fragments with no
 * relationship to each other; the border is what makes them one strip of four
 * equal claims, which is the whole point of the row.
 *
 * **The card is washed with its own icon's hue, and it is the same hue the tile
 * uses.** `hueForIcon` exists for this — its docblock says so: a caller tinting
 * something *around* the tile must not disagree with the tile sitting inside
 * it. Reading the colour from `iconMap` rather than listing four of them here
 * also means a fifth feature is coloured the moment it has an icon, with
 * nothing to add.
 *
 * **6%, against the tile's 12%.** Two numbers for one hue, and the gap between
 * them is the point: the tile has to stay a distinct patch on the card rather
 * than dissolving into it, so the card takes half the pour. The ceiling is not
 * taste — `--color-muted` body copy sits on this, and every percentage point
 * moves the ground it was measured against. `npm run audit` grades the real
 * composite on `/store` in both schemes, which is what this number was settled
 * by; **re-run it in light and dark if the mix changes**, the rule
 * `scripts/icon-tile-contrast.mjs` already states for the tile.
 *
 * `srgb` rather than `oklab`, matching `IconTile` exactly — mixing in a
 * different space would make the card and the tile two slightly different
 * colours claiming to be one.
 */
export async function TrustStrip() {
  const settings = await getSiteSettings().catch(() => ({}) as Awaited<ReturnType<typeof getSiteSettings>>);
  const shippingPaise = Math.max(0, parseInt(settings.store_shipping_paise ?? "0", 10) || 0);

  const delivery: (typeof storeTrustFeatures)[number] = shippingPaise === 0
    ? { title: "Free Delivery", icon: "truck", body: "On every order across India — no minimum spend." }
    : { title: `${formatPaise(shippingPaise)} Delivery`, icon: "truck", body: "Flat rate on every order across India." };

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[delivery, ...storeTrustFeatures].map((f) => {
        const hue = hueForIcon(f.icon);

        return (
          <li
            key={f.title}
            className="flex items-start gap-3.5 rounded-lg border p-4"
            style={{
              background: `color-mix(in srgb, ${hue} 6%, var(--color-card))`,
              // A stronger pour of the one hue for the edge, the shape
              // `IconTile` uses: the border was `line-strong`, a neutral, which
              // on a tinted card reads as a grey box somebody forgot to colour.
              borderColor: `color-mix(in srgb, ${hue} 22%, var(--color-card))`,
            } as CSSProperties}
          >
            <IconTile name={f.icon} size="md" />
            <div className="min-w-0">
              <b className="block text-[14.5px] font-semibold text-ink">{f.title}</b>
              <span className="mt-0.5 block text-[13px] leading-normal text-muted">{f.body}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
