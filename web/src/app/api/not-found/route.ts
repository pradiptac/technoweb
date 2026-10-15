import { clientIpHeaders } from "@/lib/client-ip";

/**
 * Forwards the 404 page's report of a missing address to the API.
 *
 * A route handler rather than a direct `fetch` from the page, for the reasons
 * the client-error one gives: `API_BASE_URL` is server-side only, and a
 * cross-origin POST would have to clear CORS before anything was recorded.
 *
 * It answers **204 to everything**, including a body it throws away and an API
 * that is down — the caller is a 404 page, and an error here would be a message
 * to nobody. What the API will not record (the console, secrets, scanner noise)
 * is decided there, once.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

    await fetch(`${base}/api/v1/not-found`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // The visitor, for the per-visitor throttle, rather than this server.
        ...(await clientIpHeaders()),
      },
      body: JSON.stringify({
        path: typeof body?.path === "string" ? body.path : null,
        referrer: typeof body?.referrer === "string" ? body.referrer : null,
      }),
      cache: "no-store",
    });
  } catch {
    // Deliberately silent. See above.
  }

  return new Response(null, { status: 204 });
}
