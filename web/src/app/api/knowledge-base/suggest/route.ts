import { NextResponse } from "next/server";

import { publicApi } from "@/lib/api";

/**
 * Knowledge-base articles matching a ticket subject as it is typed.
 *
 * The new-ticket form points at the knowledge base before the form; this is
 * the same idea made live — three articles under the subject field, each a
 * ticket not raised if it answers the question. The search is the public
 * one (`/knowledge-base?q=`, which matches tags and a punctuation-stripped
 * title, so "wifi" finds "Wi-Fi"), never ISR-cached, and a failure is an
 * empty list: the form is exactly the form it was before.
 */
const STOP = new Set(["the", "and", "that", "this", "with", "from", "have", "keeps", "keep", "does", "not", "when", "after", "since", "every", "again", "still", "very", "just", "into", "onto", "our", "your", "their"]);

export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (term.length < 3) return NextResponse.json({ data: [] });

  /*
   * A subject is a sentence and the search is LIKE, so "wifi keeps dropping"
   * as one phrase matches nothing while "wifi" alone finds the article. The
   * phrase is tried first — a part number or an exact title should win —
   * and then the two longest words that are not filler, one at a time,
   * stopping at the first that answers. Three fetches at most, each cheap.
   */
  const words = term.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length >= 4 && !STOP.has(w)).sort((a, b) => b.length - a.length);
  const candidates = [term, ...words.slice(0, 2).filter((w) => w !== term.toLowerCase())];

  for (const q of candidates) {
    try {
      const res = await publicApi.knowledgeArticles(`?q=${encodeURIComponent(q)}&per_page=3`, false);
      if (res.data.length === 0) continue;
      return NextResponse.json({
        data: res.data.slice(0, 3).map((a) => ({ slug: a.slug, title: a.title, excerpt: a.excerpt ?? null })),
      }, { headers: { "Cache-Control": "private, max-age=60" } });
    } catch {
      break;
    }
  }

  return NextResponse.json({ data: [] });
}
