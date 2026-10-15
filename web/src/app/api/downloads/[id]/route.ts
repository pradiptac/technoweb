import { NextResponse } from "next/server";
import { apiUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { clientIpHeaders } from "@/lib/client-ip";

/**
 * A file from the downloads centre (docs/downloads.md).
 *
 * Every download on the site is fetched here, never from an address in the
 * page: the API's file route is what counts a download and what asks who is
 * reading a customers-only one, and the portal's token lives in an httpOnly
 * cookie only this server can read. Three answers come back from it:
 *
 *   - an address (a file the media library holds) — the browser is sent on;
 *   - bytes (a private upload) — streamed through, always as an attachment;
 *   - 401 (customers only, nobody signed in) — on to the portal's sign-in,
 *     which returns to the portal's own list of downloads.
 *
 * A plain `<a>` points here, never a `next/link`: a link to a route handler
 * is prefetched, and a prefetch would count as a download.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^[0-9]{1,10}$/.test(id)) {
    return new Response("That download could not be found.", { status: 404 });
  }

  const token = await getToken();
  let upstream: Response;

  try {
    upstream = await fetch(apiUrl(`/downloads/${Number(id)}/file`), {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // The API throttles this route per visitor; behind this server every
        // request would otherwise arrive from one address.
        ...(await clientIpHeaders()),
      },
      cache: "no-store",
    });
  } catch {
    return new Response("The download could not be reached. Try again shortly.", { status: 502 });
  }

  if (upstream.status === 401) {
    // A relative Location: the browser supplies the origin, so this is right
    // behind any host the site is served on.
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/portal/login?return=%2Fportal%2Fdownloads", "Cache-Control": "no-store" },
    });
  }

  if (upstream.status === 429) {
    return new Response("Too many downloads in a short time. Wait a minute and try again.", { status: 429 });
  }

  if (!upstream.ok) {
    return new Response("That download could not be found.", { status: 404 });
  }

  if ((upstream.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await upstream.json().catch(() => null)) as { data?: { url?: unknown } } | null;
    const url = typeof body?.data?.url === "string" ? body.data.url : "";

    // Only ever an http(s) address the API named.
    if (!/^https?:\/\//i.test(url)) {
      return new Response("That download could not be found.", { status: 404 });
    }

    return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  }

  if (!upstream.body) {
    return new Response("That download could not be found.", { status: 404 });
  }

  const length = upstream.headers.get("content-length");

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      // `attachment`, always: the file is whatever was uploaded, and rendered
      // inline it would run in the site's own origin.
      "Content-Disposition":
        upstream.headers.get("content-disposition")?.replace(/^inline/i, "attachment")
        ?? `attachment; filename="download-${Number(id)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(length ? { "Content-Length": length } : {}),
    },
  });
}
