import { NextResponse } from "next/server";

/**
 * A library animation or 3D model, served from the website's origin (0.172.0,
 * docs/page-builder.md "Animation and 3D model").
 *
 * The players fetch the file from script, and a browser refuses that across
 * origins without CORS headers, which `php artisan serve` cannot send — the
 * `/font/[name]` reasoning. Only a path of the exact shape the media library
 * writes (`media/YYYY/MM/` + forty letters and digits + `.json`, `.lottie` or
 * `.glb`) is fetched, so this cannot be pointed at another file. A file
 * replaced in place gets `?v=` on its address, so the answer is cached for a
 * year.
 */
const TYPES: Record<string, string> = { json: "application/json", lottie: "application/zip", glb: "model/gltf-binary" };

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const match = /^media\/\d{4}\/\d{2}\/[A-Za-z0-9]{40}\.(json|lottie|glb)$/.exec(path);
  const base = process.env.API_BASE_URL;

  if (!match || !base) {
    return new NextResponse("Not found", { status: 404 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${base}/storage/${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch {
    return new NextResponse("The file could not be fetched", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": TYPES[match[1]!]!,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
