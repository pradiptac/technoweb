import { NextResponse } from "next/server";

import { publicApi } from "@/lib/api";

/**
 * Suggestions for the header's search box: the site-wide `/search`, trimmed
 * to three per group and only the fields a row draws.
 *
 * A route handler for the reasons `/api/store/suggest` gives — a browser
 * cannot reach the API as the site, `?q=` must never be ISR-cached, and a
 * suggestion that fails to arrive is a search box that works exactly as it
 * did before, because the form still submits to `/search`. The API already
 * ranks a part number first, so the first row under "CBS350" is the switch.
 */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (term.length < 2) return NextResponse.json({ data: [] });

  try {
    const res = await publicApi.search(term);
    const data = res.data.groups
      .filter((g) => g.results.length > 0)
      .map((g) => ({
        type: g.type,
        label: g.label,
        total: g.total,
        items: g.results.slice(0, 3).map((h) => ({ title: h.title, path: h.path })),
      }));

    return NextResponse.json({ data, total: res.data.total }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json({ data: [], total: 0 });
  }
}
