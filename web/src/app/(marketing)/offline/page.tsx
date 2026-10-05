import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { Illustration } from "@/components/ui/illustrations";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "You are offline", path: "/offline", seo: noIndex });

/**
 * What the installed app shows when there is no connection and the page
 * asked for was never opened before (2026-10-05, docs/pwa.md).
 *
 * The service worker fetches this page and every stylesheet and script it
 * names when it installs, so it is drawn in the site's own chrome and theme
 * with no network at all. It is served *in place of* the page somebody asked
 * for, at that page's address — which is why "Try again" is a plain link to
 * the empty href: it reloads the address they wanted, and works with no
 * JavaScript, since the scripts of an offline page may not be in the cache.
 *
 * `noindex` and absent from the sitemap: it is not a page anybody searches for.
 */
export default function OfflinePage() {
  return (
    <>
      <PageHero
        kicker="No connection"
        title="You are offline"
        lede="This page has not been saved on this device yet. Pages you have opened before still work — try one of those, or reconnect and try again."
      />
      <Container className="section-y">
        <Illustration name="offline" className="mb-6 h-28 w-36" />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href=""
            className="btn inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-14 font-semibold text-brand-on shadow-2 hover:bg-brand-700"
          >
            Try again
          </a>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-card px-5 text-14 font-semibold text-ink shadow-1 hover:border-secondary-400"
          >
            Go to the home page
          </Link>
        </div>
      </Container>
    </>
  );
}
