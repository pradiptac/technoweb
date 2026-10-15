import { NextResponse } from "next/server";

/**
 * A Google font file copied to this server (0.179.0, docs/theming.md),
 * served from the website's origin for the reason `/font/[name]` gives: a font
 * is refused cross-origin without CORS headers, and the API's storage is
 * another origin.
 *
 * The slug and the file are held to the shapes the API writes before any
 * request is made, so this cannot be pointed at another file on the disk. A
 * slug's files are replaced only by removing the font and installing it
 * again, which the console does not offer for one that is in use — so a year
 * of caching is safe.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await params;
  const base = process.env.API_BASE_URL;

  if (!/^[a-z0-9-]{1,62}$/.test(slug) || !/^\d{1,3}\.woff2$/.test(file) || !base) {
    return new NextResponse("Not found", { status: 404 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${base}/storage/fonts/google/${slug}/${file}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return new NextResponse("The font could not be fetched", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
