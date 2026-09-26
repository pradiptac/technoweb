import { metaCatalogueEnabled, metaCsv, metaRows, type MetaRow } from "@/lib/meta-catalogue";

/**
 * `/meta-catalogue.csv` — the Meta catalogue as a spreadsheet (2026-09-26):
 * the same rows and columns as `/meta-catalogue.xml`, for Commerce Manager's
 * scheduled feed or for somebody who would rather read it in Excel. Every
 * cell is quoted where it must be and guarded against being read as a
 * formula — see `csvCell()` in `lib/meta-catalogue.ts`.
 *
 * `inline` rather than `attachment`: Commerce Manager fetches it by URL and
 * the console's link carries `download` itself. Same caching and the same
 * empty-not-500 failure as the XML; a 404 while the setting is off.
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
    // An empty feed (the header row alone), never a 500.
  }

  return new Response(metaCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="meta-catalogue.csv"',
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
