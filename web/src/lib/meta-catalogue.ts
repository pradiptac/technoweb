import "server-only";
import { publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import type { StoreFeedItem } from "@/types/api";

/**
 * The shop as Meta's Commerce Manager reads it — Facebook, Instagram and the
 * WhatsApp Business catalogue, which is the same catalogue connected in
 * WhatsApp Business Manager (2026-09-26, `docs/store.md` "Meta catalogue").
 *
 * **Built from the Google feed's rows, never from a second query.** The
 * rows come from `/api/v1/store/feed` — `App\Support\Store\ProductFeed`,
 * the one place that decides what is listed, what an item's id is, which
 * price is the regular one and which the sale, and whether a shelf is in
 * stock, on back-order or empty. Two feeds built twice would be two answers
 * to each of those, and the two platforms suspend accounts over the same
 * mismatches. What differs is only the mapping at the sink, here:
 *
 * - `availability` in Meta's words: `in stock`, `out of stock`, and
 *   `available for order` for a back-order — the shelf is empty and the
 *   shop has agreed to take the order, which is exactly what that value
 *   means and what `in stock` would overstate.
 * - The Google-only attributes (`identifier_exists`, the shipping block,
 *   handling times, `product_detail`) are left out; Meta ignores or rejects
 *   them and none is on its specification.
 * - **No `quantity_to_sell_on_facebook`**: no stock count is ever published,
 *   the rule the storefront's own resource keeps.
 *
 * The XML is RSS 2.0 with Google's `g:` namespace, which Meta accepts as it
 * is; the CSV is the same columns for whoever prefers a spreadsheet. Each is
 * escaped at its own sink — XML text escaping, and the CSV's quoting plus
 * the formula guard `Csv::escape` keeps on the API side.
 */

/** Meta's columns, in the order its specification lists them. */
const COLUMNS = [
  "id", "title", "description", "availability", "condition", "price", "sale_price",
  "link", "image_link", "additional_image_link", "brand", "item_group_id",
  "gtin", "mpn", "google_product_category", "product_type",
  "color", "size", "material", "pattern",
] as const;

type Column = (typeof COLUMNS)[number];
export type MetaRow = Partial<Record<Column, string>> & { additional_images: string[] };

/** Meta's availability values, from the three the shop has. */
export function metaAvailability(a: StoreFeedItem["availability"]): string {
  return a === "in_stock" ? "in stock" : a === "backorder" ? "available for order" : "out of stock";
}

export function toMetaRow(row: StoreFeedItem): MetaRow {
  return {
    id: row.id,
    // Meta's limit is 200 characters, Google's 150; the row is already within both.
    title: row.title,
    description: row.description,
    availability: metaAvailability(row.availability),
    condition: row.condition,
    price: row.price,
    sale_price: row.sale_price,
    link: row.link,
    image_link: row.image_link,
    brand: row.brand,
    item_group_id: row.item_group_id,
    gtin: row.gtin,
    mpn: row.mpn,
    google_product_category: row.google_product_category,
    product_type: row.product_type,
    color: row.color,
    size: row.size,
    material: row.material,
    pattern: row.pattern,
    additional_images: row.additional_image_link ?? [],
  };
}

/** Whether the feed is switched on — `meta_catalogue_enabled`, on unless set to 0. */
export async function metaCatalogueEnabled(): Promise<boolean> {
  try {
    return settingEnabled(await getSiteSettings(), "meta_catalogue_enabled", true);
  } catch {
    return true;
  }
}

/**
 * Every row of the shop feed, in order. Capped at 20 rounds of 200 so a
 * paginator that never advances cannot spin here — the guard the Google
 * feed and `sitemap.ts` keep for the same records.
 */
export async function metaRows(): Promise<MetaRow[]> {
  const rows: StoreFeedItem[] = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const res = await publicApi.storeFeed(page);
    rows.push(...res.data);
    if (page >= (res.meta?.last_page ?? 1)) break;
    page += 1;
  }
  return rows.map(toMetaRow);
}

/** XML text escaping: every character, so no CDATA is needed and `]]>` cannot break out. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | undefined): string {
  return value === undefined || value === "" ? "" : `      <g:${name}>${xml(value)}</g:${name}>\n`;
}

export function metaXml(rows: MetaRow[]): string {
  const items = rows.map((row) => {
    const lines = COLUMNS.filter((c) => c !== "additional_image_link").map((c) => tag(c, row[c])).join("");
    // Meta takes up to twenty; the Google feed already carries at most ten.
    const extra = row.additional_images.slice(0, 20).map((u) => tag("additional_image_link", u)).join("");
    return `    <item>\n${lines}${extra}    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(SITE.name)} — Store</title>
    <link>${SITE.url}/store</link>
    <description>${xml(SITE.description)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
}

/**
 * One CSV cell: the formula guard first — a cell opening with `=`, `+`, `-`,
 * `@`, a tab or a carriage return is a formula to a spreadsheet, so it gains
 * a leading apostrophe, as `App\Support\Newsletter\Csv::escape` does — then
 * RFC 4180 quoting for a comma, a quote or a line break.
 */
export function csvCell(value: string | undefined): string {
  let v = value ?? "";
  if (v !== "" && "=+-@\t\r".includes(v[0])) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function metaCsv(rows: MetaRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => csvCell(
      // Meta reads several additional pictures from one cell, comma-separated.
      c === "additional_image_link" ? row.additional_images.slice(0, 20).join(",") : row[c],
    )).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
