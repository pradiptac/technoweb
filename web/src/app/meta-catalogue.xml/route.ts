import { metaCatalogueEnabled, metaRows, metaXml, type MetaRow } from "@/lib/meta-catalogue";

/**
 * `/meta-catalogue.xml` — the shop for Meta's Commerce Manager, which stocks
 * Facebook and Instagram Shops and the WhatsApp Business catalogue
 * (2026-09-26). The Google feed's rows, mapped at the sink; see
 * `lib/meta-catalogue.ts`.
 *
 * Commerce Manager → Catalogue → Data sources → Data feed → Scheduled feed,
 * and paste `https://www.technoware.in/meta-catalogue.xml`. The same catalogue
 * is then connected in WhatsApp Business Manager.
 *
 * Cached for an hour, the Google feed's window, and the same failure: an
 * empty feed rather than a 500, because a platform that reads a failed fetch
 * as a failed fetch disapproves every item after a few, and an empty one
 * recovers at the next fetch. Off (`meta_catalogue_enabled` = 0), it is a 404.
 */
export const revalidate = 3600;

export async function GET() {
  if (!(await metaCatalogueEnabled())) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  let rows: MetaRow[] = [];
  try {
    rows = await metaRows();
  } catch {
    // An empty feed, never a 500 — see above.
  }

  return new Response(metaXml(rows), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
