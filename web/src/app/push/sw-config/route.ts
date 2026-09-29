import { getSiteSettings } from "@/lib/settings";
import { brandName } from "@/lib/brand";

/**
 * What the push service worker needs that a push does not carry: the name
 * to title a notification that arrives without one, and the icon to draw it
 * with. Read by `public/firebase-messaging-sw.js` on each push — a service
 * worker is a static file and cannot be templated with the settings, so it
 * asks here.
 *
 * Public by nature, like the rest of the push config, and cached with the
 * settings it is built from.
 */
export const revalidate = 600;

export async function GET() {
  const settings = await getSiteSettings();

  return Response.json(
    {
      name: settings.company_name || brandName(),
      icon: settings.favicon_url || "/favicon.ico",
    },
    { headers: { "Cache-Control": "public, max-age=600" } },
  );
}
