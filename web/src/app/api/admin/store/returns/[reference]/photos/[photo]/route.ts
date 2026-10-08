import { getToken } from "@/lib/admin-auth";
import { streamPrivateFile } from "@/lib/stream-attachment";

/**
 * A photograph a customer sent with a return, streamed to staff
 * (docs/store.md "Returns"). It lives on the API's private disk and has no
 * address; the admin token is in an httpOnly cookie only this server can
 * read. Always an attachment — it is a stranger's upload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string; photo: string }> }) {
  const { reference, photo } = await params;

  // Both segments go into the API's path, so both are held to their shapes here.
  if (!/^[A-Za-z][A-Za-z0-9]{1,5}-\d{4}-\d{1,9}$/.test(reference) || !/^[0-9]{1,10}$/.test(photo)) {
    return new Response("That photograph is not available.", { status: 404 });
  }

  return streamPrivateFile(
    await getToken(),
    `admin/store/returns/${reference}/photos/${Number(photo)}`,
    `return-${reference}-${Number(photo)}`,
  );
}
