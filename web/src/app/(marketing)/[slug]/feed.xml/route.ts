import { ApiError, publicApi } from "@/lib/api";
import { SITE } from "@/lib/seo";

/**
 * The newsroom's RSS feed (docs/content-presets.md): the thirty newest press
 * releases. Any other content type answers 404 — a feed of testimonials is
 * not something a reader subscribes to.
 *
 * A static segment under `[slug]`, so it outranks `[entry]`; and a dot can
 * never appear in an entry's slug, so no entry is shadowed by it. Escaped at
 * the sink, the blog feed's rule: a headline containing `]]>` or `</item>`
 * cannot break out of the document. Cached under the type's own tag, so a
 * release saved in the console reaches it at once.
 */
export const revalidate = 600;

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const res = await publicApi.contentArchive(slug, "?per_page=30").catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!res || res.meta.type.preset !== "newsroom_releases") {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const type = res.meta.type;
  const items = res.data.map((e) => {
    const link = `${SITE.url}${e.path}`;
    return [
      "    <item>",
      `      <title>${xml(e.title)}</title>`,
      `      <link>${xml(link)}</link>`,
      `      <guid isPermaLink="true">${xml(link)}</guid>`,
      e.published_at ? `      <pubDate>${new Date(e.published_at).toUTCString()}</pubDate>` : "",
      e.summary ? `      <description>${xml(e.summary)}</description>` : "",
      "    </item>",
    ].filter(Boolean).join("\n");
  }).join("\n");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(`${type.plural} — ${SITE.name}`)}</title>`,
    `    <link>${xml(`${SITE.url}${type.path}`)}</link>`,
    `    <atom:link href="${xml(`${SITE.url}${type.path}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    `    <description>${xml(type.description ?? `${type.plural} from ${SITE.name}`)}</description>`,
    "    <language>en-IN</language>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
