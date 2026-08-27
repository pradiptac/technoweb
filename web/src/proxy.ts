import { NextResponse, type NextRequest } from "next/server";

/**
 * Honours redirects recorded by the API.
 *
 * When an editor changes a slug, Laravel writes a 301 into the `redirects`
 * table. This consults that table before Next renders a 404, so an old URL
 * keeps working — and keeps whatever ranking it had.
 *
 * Named `proxy`, not `middleware`: Next 16 deprecated that file convention and
 * warns on every build until it is renamed. The rename is the whole migration —
 * the function body, the `config` export and the matcher are unchanged. Worth
 * knowing that a proxy now defaults to the Node.js runtime rather than the edge
 * one, which for this file means the `fetch` below runs where the rest of the
 * server code does.
 *
 * It only runs on paths that could plausibly be a renamed content URL, and only
 * when nothing else matched, so the extra request never touches the hot path.
 */
/*
 * Every prefix a model writes a redirect at.
 *
 * This list and `urlPrefix()` on the Laravel side are two halves of one rule
 * with the wire between them, and nothing type-checks one against the other —
 * a model that writes 301s at a prefix missing from here writes them into a
 * void, and the symptom is a URL that 404s after somebody fixed a typo on a
 * different screen. `/careers/` was in exactly that state: `JobOpening` uses
 * `Sluggable`, so renaming a vacancy has always written a redirect that this
 * file never looked for.
 *
 * `/brands/` and `/locations/` are here because the landing pages recompute
 * their path from records they do not own — renaming a brand moves every page
 * about it, which is the case most in need of the redirect working.
 *
 * **`Page` is the deliberate exception.** Its `urlPrefix()` is `''`, so CMS
 * pages live at `/{slug}` and covering them means matching nearly every path on
 * the site. Renaming `/privacy` therefore leaves a 301 nothing serves. That is
 * a real gap and it is left open on purpose rather than by omission: closing it
 * costs an API round trip on every unmatched URL, which is a price paid on
 * every 404 a crawler generates, and the fix if it is ever wanted is a
 * catch-all route rather than a wider prefix list here.
 */
const CHECKED_PREFIXES = [
  "/solutions/", "/services/", "/products/", "/industries/",
  "/blog/", "/case-studies/", "/knowledge-base/",
  "/careers/", "/brands/", "/locations/",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!CHECKED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Signals to the route handler that this request already passed through here,
  // preventing a loop if the redirect target is itself missing.
  if (request.headers.get("x-redirect-checked")) return NextResponse.next();

  const base = process.env.API_BASE_URL;
  if (!base) return NextResponse.next();

  try {
    const res = await fetch(
      `${base}/api/v1/redirects/lookup?path=${encodeURIComponent(pathname)}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 300 } },
    );

    if (!res.ok) return NextResponse.next();

    const payload = (await res.json()) as { data: { to: string; status: number } | null };
    if (!payload.data) return NextResponse.next();

    const target = new URL(payload.data.to + search, request.url);
    return NextResponse.redirect(target, payload.data.status === 302 ? 302 : 301);
  } catch {
    // A redirect lookup must never take the site down — fall through to the 404.
    return NextResponse.next();
  }
}

export const config = {
  // Skip static assets, images and API routes entirely.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
