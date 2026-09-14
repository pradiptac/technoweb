import { NextResponse } from "next/server";

import { publicApi } from "@/lib/api";
import type { StoreSuggestion } from "@/types/api";

/**
 * Products matching what is being typed into the shop's search box.
 *
 * A route handler, for the reasons `/api/companies` gives: a GET of a fact
 * somebody is typing towards, proxied because the API is on another origin and
 * a browser cannot reach it as the site. It reads the storefront listing with
 * `?q=` and hands back only what a suggestion row draws — a name, a part
 * number, a price, a picture — rather than the whole product, which carries a
 * description and a specification sheet nobody is going to read in a
 * dropdown.
 *
 * **Not ISR-cached.** `?q=` has an unbounded key space, and caching it fills
 * the data cache with single-use entries — the rule `publicApi.storeProducts`
 * states for the listing, and this is the listing. What is set is a short
 * *browser* cache, which is bounded per person: typing "cis", then "cisc",
 * then backspacing to "cis" should not ask the API a second time.
 *
 * A failure is an empty list rather than an error. A suggestion that does not
 * arrive is a search box that works exactly as it did before suggestions
 * existed — the form still submits.
 */
export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (term.length < 2) return NextResponse.json({ data: [] });

  try {
    const res = await publicApi.storeProducts(`?q=${encodeURIComponent(term)}&per_page=6`, false);

    const data: StoreSuggestion[] = res.data.map((p) => ({
      slug: p.slug,
      name: p.name,
      sku: p.sku ?? null,
      brand: p.brand?.name ?? null,
      price_paise: p.price_paise,
      in_stock: p.in_stock,
      image: p.images?.[0] ?? null,
      image_alt: p.image_alts?.[0] ?? null,
    }));

    return NextResponse.json({ data, total: res.meta.total }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
