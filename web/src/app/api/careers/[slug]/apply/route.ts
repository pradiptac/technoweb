import { proxyMultipart } from "@/lib/proxy-upload";

/**
 * A job application — the one unauthenticated upload in the product, as a
 * request the browser can watch so the CV shows a percentage going up.
 *
 * No session, deliberately: the API endpoint is public, throttled at 5/min
 * and guarded by the `website` honeypot, and every one of those rules is
 * applied there. The client's address is forwarded so the throttle counts
 * the visitor and not this server.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return proxyMultipart(request, `/careers/${encodeURIComponent(slug)}/apply`);
}
