import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

/**
 * Throw away every cached page, so the next request renders from the API.
 *
 * Called by the setup wizard once the site is connected and by the updater at
 * the end of an update — never by a person. A portable build prerenders its
 * index pages with no API to read (`lib/build-phase.ts`), so until this runs
 * they hold an error state; and after an update, a page cached by the old
 * release may describe data the new one has migrated.
 *
 * Authorised by `INTERNAL_TOKEN`, which the installer writes into both
 * `config/api.env` and `config/web.env`: the API is the only other holder. No
 * token configured means the route does not exist — an empty secret compared
 * with an empty header would otherwise let anybody purge the cache, which is
 * a cheap way to make every page render cold at once. Compared in constant
 * time. POST only, so a link or a prefetch can never reach it.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const expected = process.env.INTERNAL_TOKEN?.trim() ?? "";
  if (expected.length < 32) return false;

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return new Response(null, { status: 404 });
  }

  // The root layout covers every route in the application, so this is the
  // whole route cache and every data-cache entry the pages read through.
  revalidatePath("/", "layout");

  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
