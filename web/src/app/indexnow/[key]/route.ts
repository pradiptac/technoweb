import { getSiteSettings } from "@/lib/settings";

/**
 * `/indexnow/{key}.txt` — the key file the IndexNow engines fetch to verify a
 * submission came from this site.
 *
 * The key is a public setting minted by the API (`App\Support\IndexNow`),
 * so this answers only for the one key that is stored and 404s for any
 * other: a key file that echoed whatever it was asked for would verify
 * anybody's pings for this host. The body is the key alone, as the protocol
 * requires.
 */
export const revalidate = 600;

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const wanted = key.endsWith(".txt") ? key.slice(0, -4) : key;
  const stored = (await getSiteSettings()).indexnow_key?.trim();

  if (!stored || !/^[a-z0-9-]{8,128}$/i.test(wanted) || wanted !== stored) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(stored, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
