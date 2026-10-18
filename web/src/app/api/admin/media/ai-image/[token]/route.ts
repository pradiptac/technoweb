import { getToken } from "@/lib/admin-auth";
import { streamPrivateFile } from "@/lib/stream-attachment";

/**
 * A made picture's preview, streamed to its owner (0.184.0). It has no public
 * address: the admin token is in an httpOnly cookie only this server reads,
 * so the `<img>` in the console points here and never at the API.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response("That picture is not available.", { status: 404 });
  }

  const res = await streamPrivateFile(await getToken(), `admin/media/ai-image/${token}`, "ai-picture");
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Content-Type-Options", "nosniff");

  return res;
}
