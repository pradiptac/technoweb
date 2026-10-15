import { getToken } from "@/lib/admin-auth";

/**
 * One form's submissions as a CSV, proxied.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * subscriber and lead exports document: the admin token lives in an httpOnly
 * cookie only the Next server can read, so a browser following a link to the
 * API sends no credentials and gets a 401. A Server Action cannot do it
 * either — an action returns a value, not a response a browser will save.
 *
 * Streamed rather than buffered. The screen links here with a plain
 * `<a download>`, never a `next/link`: a link to a route handler is
 * prefetched, and this one builds the whole file every time it is asked.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }
  // The id goes into an upstream URL, so it is a number or it is nothing.
  if (!/^\d+$/.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/admin/forms/${Number(id)}/submissions/export`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" }, cache: "no-store" },
  );

  if (upstream.status === 404) {
    return new Response("Not found.", { status: 404 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("The export could not be produced.", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Passed through so the filename the API chose is the one saved.
      "Content-Disposition": upstream.headers.get("content-disposition")
        ?? `attachment; filename="form-${Number(id)}-submissions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
