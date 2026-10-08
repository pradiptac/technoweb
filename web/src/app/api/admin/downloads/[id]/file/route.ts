import { getToken } from "@/lib/admin-auth";
import { streamPrivateFile } from "@/lib/stream-attachment";

/**
 * A download's private upload, streamed to staff — the console's way to
 * check what was uploaded (docs/downloads.md). The file has no address; the
 * admin token lives in an httpOnly cookie only this server can read, so the
 * link on the form points here and never at the API.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^[0-9]{1,10}$/.test(id)) {
    return new Response("That file is not available.", { status: 404 });
  }

  return streamPrivateFile(await getToken(), `admin/downloads/${Number(id)}/file`, `download-${Number(id)}`);
}
