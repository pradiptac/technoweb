import { NextRequest } from "next/server";
import { getToken } from "@/lib/admin-auth";

/**
 * The subscriber CSV, proxied.
 *
 * A route handler rather than a link straight at the API, because the admin
 * token lives in an httpOnly cookie that only the Next server can read — a
 * browser following a link to `api.technoware.in` sends no credentials and
 * gets a 401. Everything else in the console goes through a Server Action for
 * the same reason; a file download cannot, because an action returns a value
 * rather than a response the browser will save.
 *
 * The body is streamed through rather than buffered: an export of fifty
 * thousand subscribers should not be held in memory here on its way past.
 */
export async function GET(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return new Response("Not signed in.", { status: 401 });
  }

  const params = request.nextUrl.searchParams.toString();
  const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

  const upstream = await fetch(
    `${base}/api/v1/admin/newsletter/subscribers/export${params ? `?${params}` : ""}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" }, cache: "no-store" },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response("The export could not be produced.", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Passed through so the filename the API chose is the one saved.
      "Content-Disposition": upstream.headers.get("content-disposition")
        ?? 'attachment; filename="subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
