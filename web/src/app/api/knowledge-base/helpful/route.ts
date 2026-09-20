import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";

/**
 * "Was this helpful?" from an article, forwarded to the API.
 *
 * A route handler rather than a Server Action, because the vote is a fire-
 * and-forget POST from a button that must not re-render the article or
 * reset anything on it. 204 whatever the API answers — the reader's mark
 * is kept in their browser, and there is nothing a failure would have them
 * do. `slug` is checked for shape so this cannot be pointed at any path.
 */
export async function POST(request: Request) {
  const { slug } = (await request.json().catch(() => ({}))) as { slug?: unknown };

  if (typeof slug === "string" && /^[a-z0-9-]{1,200}$/.test(slug)) {
    await apiFetch(`/knowledge-base/${slug}/helpful`, { method: "POST" }).catch(() => undefined);
  }

  return new NextResponse(null, { status: 204 });
}
