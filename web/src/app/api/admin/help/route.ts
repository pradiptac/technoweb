import { NextResponse, type NextRequest } from "next/server";

import help from "@/content/help.json";
import { getCurrentStaff } from "@/lib/admin-auth";
import { helpIdsFor } from "@/lib/help-routes";
import { tourFor } from "@/lib/tours";

type Section = { id: string; chapter: string; chapterTitle: string; title: string; html: string; text: string };
const SECTIONS = (help as { sections: Section[] }).sections;
const BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The console's help drawer (docs/help-and-tours.md). Read here, on the
 * server, so the manual never enters a page's JavaScript. Staff only.
 *
 *   ?path=/admin/tickets    this screen's sections, its tour, its chapter
 *   ?q=words                up to 20 sections holding every word, title matches first
 *   ?section=08-tickets#…   one section, for a link inside the drawer
 *   ?chapter=08-tickets     a chapter's sections, for "Open this chapter"
 */
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff().catch(() => null);
  if (!staff) return NextResponse.json({ message: "Unauthenticated." }, { status: 401, headers: NO_STORE });
  const params = request.nextUrl.searchParams;

  const id = params.get("section");
  if (id) return NextResponse.json({ section: BY_ID.get(id) ?? null }, { headers: NO_STORE });

  const chapter = params.get("chapter");
  if (chapter) return NextResponse.json({ sections: SECTIONS.filter((s) => s.chapter === chapter) }, { headers: NO_STORE });

  const q = params.get("q")?.trim().toLowerCase().slice(0, 100);
  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    const inTitle = (s: Section) => words.every((w) => s.title.toLowerCase().includes(w));
    const results = SECTIONS.filter((s) => inTitle(s) || words.every((w) => s.text.toLowerCase().includes(w)))
      .sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)))
      .slice(0, 20)
      .map((s) => {
        const at = Math.max(0, s.text.toLowerCase().indexOf(words[0]!) - 60);
        return { id: s.id, title: s.title, chapterTitle: s.chapterTitle, excerpt: s.text.slice(at, at + 160) };
      });
    return NextResponse.json({ results }, { headers: NO_STORE });
  }

  const path = params.get("path") ?? "/admin";
  const search = params.get("search") ?? "";
  const sections = helpIdsFor(path, SECTIONS).map((i) => BY_ID.get(i)).filter((s): s is Section => Boolean(s));
  const first = sections[0];
  return NextResponse.json(
    { sections, tour: tourFor(path, search), chapter: first ? { id: first.chapter, title: first.chapterTitle } : null },
    { headers: NO_STORE },
  );
}
