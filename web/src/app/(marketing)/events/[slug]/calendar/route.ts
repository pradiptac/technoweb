/**
 * The same `.ics` at the address the API itself publishes.
 *
 * Every event read carries `calendar_path` — `/events/{slug}/calendar` — and
 * a link built from it (a line in a confirmation email, say) lands on this
 * origin, not the API's. So this path answers too, with the one handler:
 * `/api/events/{slug}/calendar` is what the site's own buttons use, because
 * `/api/` is where crawlers and the service worker are already told not to
 * go, and this is the alias that keeps the API's word true.
 */
export { GET } from "@/app/api/events/[slug]/calendar/route";
