import { NextResponse } from "next/server";

import { getToken } from "@/lib/admin-auth";

/**
 * One Google font's sample for the console's font browser (0.179.0). The API
 * downloads the regular Latin face once and caches it; this hands it on, so
 * the console's browser never contacts Google either. The slug is held to its
 * own alphabet before any request is made.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = await getToken();

  if (!token) return new NextResponse("Not signed in.", { status: 401 });
  if (!/^[a-z0-9-]{1,62}$/.test(slug)) return new NextResponse("Not found", { status: 404 });

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
  let upstream: Response;

  try {
    upstream = await fetch(`${base}/api/v1/admin/settings/google-fonts/preview/${slug}`, {
      headers: { Accept: "font/woff2", Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return new NextResponse("The sample could not be fetched", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: upstream.status === 401 ? 401 : 404 });

  return new NextResponse(upstream.body, {
    headers: { "Content-Type": "font/woff2", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
