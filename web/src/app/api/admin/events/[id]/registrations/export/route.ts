import { getToken } from "@/lib/admin-auth";
import { streamPrivateFile } from "@/lib/stream-attachment";

/**
 * One event's registrations as a CSV, proxied.
 *
 * A route handler rather than a link straight at the API, for the reason the
 * form-submission and lead exports document: the staff token lives in an
 * httpOnly cookie only the Next server can read, so a browser following a
 * link to the API sends no credentials. A Server Action cannot do it either —
 * an action returns a value, not a response a browser will save.
 *
 * `streamPrivateFile` does the fetch and the refusal: streamed rather than
 * buffered, `no-store`, the API's own `Content-Disposition` passed through so
 * the filename it chose is the one saved, and a 404 for anything that is not
 * an expired session — the API answers 404 for an event that is not there and
 * 403 for a role without the list, and neither needs telling apart here.
 * The file is names, addresses and telephone numbers, which is why it is
 * never cached and never linked with a `next/link`: a link to a route
 * handler is prefetched, and this one builds the whole file every time.
 *
 * The id goes into an upstream URL, so it is a number or it is nothing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return new Response("Not found.", { status: 404 });
  }

  return streamPrivateFile(
    await getToken(),
    `admin/events/${Number(id)}/registrations/export`,
    `event-${Number(id)}-registrations.csv`,
  );
}
