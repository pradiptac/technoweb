import { NextResponse } from "next/server";

/**
 * A company's own font file, served from the website's origin (0.125.0,
 * docs/theming.md).
 *
 * The file is on the API's public disk, and a browser will not use a font
 * from another origin unless that origin sends CORS headers — which Apache
 * can be told to and `php artisan serve` cannot. Fetching it here and
 * handing it on makes the font same-origin everywhere, development included,
 * and puts it behind whatever CDN the website sits behind.
 *
 * The name is one the API generated — forty letters and digits and
 * `.woff2` — and anything else is a 404 before a request is made, so this
 * cannot be pointed at another file on the disk. The name never repeats (a
 * replaced font gets a new one), so the answer is cached for a year.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const base = process.env.API_BASE_URL;

  if (!/^[A-Za-z0-9]{40}\.woff2$/.test(name) || !base) {
    return new NextResponse("Not found", { status: 404 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${base}/storage/fonts/${name}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
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
