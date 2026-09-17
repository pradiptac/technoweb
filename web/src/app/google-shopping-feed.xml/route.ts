import { GET as feed } from "@/app/(marketing)/store/feed.xml/route";

/**
 * `/google-shopping-feed.xml` — the Merchant Center feed under the name a
 * reviewer or a checklist expects (the client's, 2026-09-17). The feed is
 * `/store/feed.xml`; this calls the same handler at a second address, so
 * the two cannot drift and Merchant Center can be pointed at either. The
 * segment config is restated rather than re-exported: Next parses it
 * statically and refuses an `export … from`.
 */
export const revalidate = 3600;

export async function GET() {
  return feed();
}
