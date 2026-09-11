import { publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";
import type { StoreFeedItem } from "@/types/api";

/**
 * The shop as a Google Merchant Center feed.
 *
 * RSS 2.0 with the `g:` namespace, which is the one format Google's scheduled
 * fetch has read since the beginning and the one every other shopping engine
 * copied. Submit `https://www.technoware.in/store/feed.xml` in Merchant Center
 * as a scheduled fetch and it is polled daily.
 *
 * A route handler rather than a page: this is a document, not a screen. And
 * the rows come from `/api/v1/store/feed` as **data** — the markup is built
 * here, where `xml()` lives, because escaping belongs at the sink. That is the
 * same boundary `JsonLd` keeps for structured data and for the same reason: a
 * product legitimately named `A <> B` must not be able to close the document.
 *
 * Cached for an hour, matching the blog's feed. Merchant Center fetches on a
 * schedule rather than on demand, and a listing's price is kept current
 * between fetches by the Product markup on the page itself.
 */
export const revalidate = 3600;

/**
 * XML text escaping. Every character, so no CDATA is needed and a CMS field
 * carrying `]]>` cannot break out of one — see `blog/rss.xml/route.ts`.
 */
function xml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** One `<g:name>value</g:name>` line, or nothing when there is no value. */
function tag(name: string, value: string | number | undefined): string {
  return value === undefined || value === "" ? "" : `      <g:${name}>${xml(value)}</g:${name}>\n`;
}

/**
 * Every page of the feed, in order.
 *
 * Capped at 20 rounds of 200 so a paginator that never advances cannot spin
 * here — the same guard `sitemap.ts` keeps for the same records.
 */
async function everyItem(): Promise<StoreFeedItem[]> {
  const rows: StoreFeedItem[] = [];
  let page = 1;
  for (let guard = 0; guard < 20; guard++) {
    const res = await publicApi.storeFeed(page);
    rows.push(...res.data);
    if (page >= (res.meta?.last_page ?? 1)) break;
    page += 1;
  }
  return rows;
}

function item(row: StoreFeedItem): string {
  /*
   * Order follows Google's own specification page, so a person diffing this
   * against the documentation reads it top to bottom. Keys absent from the row
   * are absent from the item — the API filters them — so `tag()` is the only
   * conditional needed.
   */
  return `    <item>
${tag("id", row.id)}${tag("item_group_id", row.item_group_id)}${tag("title", row.title)}${tag("description", row.description)}${tag("link", row.link)}${tag("image_link", row.image_link)}${(row.additional_image_link ?? []).map((u) => tag("additional_image_link", u)).join("")}${tag("availability", row.availability)}${tag("price", row.price)}${tag("sale_price", row.sale_price)}${tag("condition", row.condition)}${tag("brand", row.brand)}${tag("gtin", row.gtin)}${tag("mpn", row.mpn)}${tag("identifier_exists", row.identifier_exists)}${tag("google_product_category", row.google_product_category)}${tag("product_type", row.product_type)}${tag("color", row.color)}${tag("size", row.size)}${tag("material", row.material)}${tag("pattern", row.pattern)}${(row.product_detail ?? [])
    .map(
      (d) => `      <g:product_detail>
        <g:section_name>${xml(d.section)}</g:section_name>
        <g:attribute_name>${xml(d.name)}</g:attribute_name>
        <g:attribute_value>${xml(d.value)}</g:attribute_value>
      </g:product_detail>
`,
    )
    .join("")}      <g:shipping>
        <g:country>${xml(row.shipping_country)}</g:country>
        <g:price>${xml(row.shipping_price)}</g:price>
      </g:shipping>
${tag("shipping_weight", row.shipping_weight)}${tag("min_handling_time", row.min_handling_time)}${tag("max_handling_time", row.max_handling_time)}    </item>`;
}

export async function GET() {
  let rows: StoreFeedItem[] = [];

  try {
    rows = await everyItem();
  } catch {
    /*
     * An empty feed rather than a 500.
     *
     * Merchant Center reads a failed fetch as a failed fetch and, after
     * enough of them, disapproves every item for want of data. A valid feed
     * with nothing in it is also read as "every item gone" — but only at the
     * next fetch, which is a day away, and by then the API is back. Neither is
     * good; the second recovers by itself. Same reasoning as the sitemap.
     */
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(SITE.name)} — Store</title>
    <link>${SITE.url}/store</link>
    <description>${xml(SITE.description)}</description>
${rows.map(item).join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
