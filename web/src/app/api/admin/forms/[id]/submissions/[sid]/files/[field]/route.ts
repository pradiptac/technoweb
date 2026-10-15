import { getToken } from "@/lib/admin-auth";
import { streamPrivateFile } from "@/lib/stream-attachment";

/**
 * A file somebody sent through a form, streamed to a signed-in member of staff.
 *
 * It is on the API's private disk like a ticket attachment and for the same
 * reason — an upload on an enquiry form is a site plan, a CV, a photograph of
 * a fault — so there is no public URL, and the console links here rather than
 * at the API, where a plain `<a href>` would arrive without the token
 * (`lib/stream-attachment.ts`). The API decides whether the caller's role may
 * read it; this only carries the token and the bytes.
 *
 * The three segments come from the address bar and go into an upstream URL,
 * so each is held to its own shape first: two ids, and a field name in the
 * alphabet the API allows for one. Anything else is the same 404 a missing
 * file gets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sid: string; field: string }> },
) {
  const { id, sid, field } = await params;

  if (!/^\d+$/.test(id) || !/^\d+$/.test(sid) || !/^[a-z][a-z0-9_]{0,59}$/.test(field)) {
    return new Response("That attachment is not available.", { status: 404 });
  }

  return streamPrivateFile(
    await getToken(),
    `admin/forms/${Number(id)}/submissions/${Number(sid)}/files/${field}`,
    `submission-${Number(sid)}-${field}`,
  );
}
