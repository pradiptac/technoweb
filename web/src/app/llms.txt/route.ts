import { llmsIndex } from "@/lib/llms";

/**
 * `/llms.txt` — the site as an assistant reads it. See `lib/llms.ts`.
 * A route handler rather than a page: this is a document, not a screen.
 * Cached for an hour, like the feed.
 */
export const revalidate = 3600;

export async function GET() {
  return new Response(await llmsIndex(), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
