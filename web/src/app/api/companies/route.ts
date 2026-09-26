import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";

/**
 * Company names already on file, for the registration form's suggestions.
 *
 * A route handler rather than a Server Action, the reasoning `/api/pincode`
 * spells out: this is a GET of a fact somebody is typing towards, and it costs
 * one small request instead of a POST and a render pass.
 *
 * It exists at all because the API lives on another origin. A `<datalist>` is
 * filled from the browser, and the browser cannot reach `api.technoware.in`
 * with the site's own credentials — this is unauthenticated either way, but
 * proxying keeps one origin in the page's network panel and one place to stop
 * if the endpoint is ever moved behind the admin session.
 *
 * **Not cached on the server.** It was, for five minutes (`revalidate: 300`),
 * against the rule that a typed query is never ISR-cached: every prefix
 * anybody typed became its own cache entry, and a colleague registering a
 * minute after the first person from their firm was told nothing matched. An
 * uncached call also carries the visitor's address, so the API's 20-a-minute
 * limit is per visitor rather than per site. The browser may keep its own
 * answer briefly (`private`) — that is one person's cache of their own typing.
 * A failure returns an empty list rather
 * than an error — a suggestion that does not arrive is a form that works
 * exactly as it did before suggestions existed.
 */
export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q") ?? "";

  // The floor is enforced by the API too. Stopping here as well saves a
  // request per keystroke for the two characters that can never match.
  if (term.trim().length < 3) return NextResponse.json({ data: [] });

  try {
    const res = await apiFetch<{ data: string[] }>(
      `/companies/suggest?q=${encodeURIComponent(term.trim())}`,
      { cache: "no-store" },
    );

    return NextResponse.json({ data: res.data }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
