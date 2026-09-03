import { publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";
import type { BlogPost } from "@/types/api";

/**
 * The blog's RSS feed.
 *
 * A blog with no feed was the one thing the deep audit found genuinely missing
 * rather than deliberately absent — every other gap in that list was a decision
 * somebody had taken and signposted.
 *
 * A route handler rather than a page: this is a document, not a screen. It is
 * also why nothing here uses `next/link` — a link that prefetched a feed would
 * rebuild it on every hover.
 *
 * Cached for an hour. A feed reader polls, often rudely, and the content
 * changes when somebody publishes rather than continuously — the same trade
 * `publicApi.menu()` makes at 600s.
 */
export const revalidate = 3600;

/**
 * XML text escaping.
 *
 * The same reasoning `JsonLd` documents for `<` inside a script tag: escaping
 * belongs at the sink. A post legitimately titled `A <> B` must work, so the
 * fix is to escape here rather than to sanitise titles on the way in — and a
 * CMS field carrying `]]>` would otherwise close a CDATA block and put the rest
 * of the document at markup level, which is the same breakout in a different
 * syntax. Escaping every character means no CDATA is needed at all.
 */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  let posts: BlogPost[] = [];

  try {
    // One page. A feed is the recent past — readers do not page through one,
    // and a full catalogue dump would grow without limit.
    const res = await publicApi.posts("?per_page=20");
    posts = res.data;
  } catch {
    /*
     * An empty feed rather than a 500.
     *
     * A reader that gets an error may back off for a long time or unsubscribe;
     * one that gets a valid feed with nothing new in it simply asks again
     * later. Same reasoning as the sitemap degrading to its static routes
     * rather than emitting nothing.
     */
  }

  const items = posts
    .map((post) => {
      const url = `${SITE.url}/blog/${post.slug}`;
      const date = post.published_at ? new Date(post.published_at).toUTCString() : "";

      return `    <item>
      <title>${xml(post.title)}</title>
      <link>${xml(url)}</link>
      <description>${xml(post.excerpt ?? "")}</description>
      ${date ? `<pubDate>${date}</pubDate>` : ""}
      ${post.author?.name ? `<dc:creator>${xml(post.author.name)}</dc:creator>` : ""}
      ${(post.categories ?? []).map((c) => `<category>${xml(c.name)}</category>`).join("\n      ")}
      <guid isPermaLink="true">${xml(url)}</guid>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(SITE.name)} — Blog</title>
    <link>${SITE.url}/blog</link>
    <description>${xml(SITE.description)}</description>
    <language>en-in</language>
    <atom:link href="${SITE.url}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: {
      // `application/rss+xml`, which is what readers sniff for. `text/xml`
      // works and is what a browser renders as a tree instead of offering the
      // subscription.
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
