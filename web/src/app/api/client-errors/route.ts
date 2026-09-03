/**
 * Forwards a browser's error report to the API.
 *
 * A route handler rather than a direct `fetch` from the page for two reasons,
 * neither of them incidental: `API_BASE_URL` is server-side only, so the bundle
 * does not know where the API is; and a cross-origin POST from a page that has
 * already failed would have to clear CORS before anything was recorded.
 *
 * It answers **204 to everything**, including a body it throws away and an API
 * that is down. The caller is an error handler — telling it that reporting the
 * error also failed gives it nothing it can act on and invites a loop. The same
 * reasoning the payment and bounce webhooks apply to their own callers.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

    await fetch(`${base}/api/v1/client-errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        /*
         * Passed through, because the API records it and the useful answer is
         * the *reader's* browser rather than this server's fetch agent — "only
         * happens in Safari 17" is most of a diagnosis.
         */
        "User-Agent": request.headers.get("user-agent") ?? "unknown",
      },
      body: JSON.stringify({
        area: typeof body?.area === "string" ? body.area : "site",
        message: typeof body?.message === "string" ? body.message : "",
        digest: typeof body?.digest === "string" ? body.digest : null,
        path: typeof body?.path === "string" ? body.path : null,
      }),
      cache: "no-store",
    });
  } catch {
    // Deliberately silent. See above.
  }

  return new Response(null, { status: 204 });
}
