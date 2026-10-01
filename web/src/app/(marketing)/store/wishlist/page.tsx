import Link from "next/link";
import { PageHero } from "@/components/ui/page-hero";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/input";
import { WishlistList } from "@/components/store/wishlist-list";
import { WishlistAlertsToggle, WishlistEmailForm } from "@/components/store/wishlist-alerts";
import { getWishlist } from "@/lib/wishlist";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { getSiteSettings } from "@/lib/settings";
import { portalEnabled } from "@/lib/site-settings";
import type { VisibleWishlist } from "@/components/store/wishlist-actions";

/**
 * The wishlist page. `noindex`, and dynamic: a list is one person's and is
 * read from a cookie, so there is nothing to cache and nothing for a search
 * engine — the basket page's reasoning, and like `/cart` it states it rather
 * than leaving it to be inferred. Not a `[slug]` route, so reading a cookie
 * here costs no cached page anything.
 *
 * A signed-in customer sees their account's list — the same one as the
 * portal's Wishlist tab — and a guest sees the list this browser holds, with
 * the one way a guest is ever told a saved thing is back or cheaper: an
 * address, asked for here and nowhere else.
 */
export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "Your wishlist", path: "/store/wishlist", seo: noIndex });

const EMPTY: VisibleWishlist = { account: false, items: [], item_count: 0, email: null, alerts: false };

export default async function WishlistPage() {
  const [found, settings] = await Promise.all([getWishlist(), getSiteSettings()]);
  // No sign-in to offer while the portal is switched off (`portal_enabled`).
  const portal = portalEnabled(settings);
  const list: VisibleWishlist = found ? stripToken(found) : EMPTY;
  const guestWithoutAddress = !list.account && list.items.length > 0 && !list.email;

  return (
    <>
      <PageHero
        section="store"
        kicker="Store"
        title="Your wishlist"
        lede="Things you have saved for later, at today's prices."
        crumbs={[{ name: "Store", path: "/store" }, { name: "Wishlist", path: "/store/wishlist" }]}
      />

      <section className="section-y">
        <Container>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
            {/* `min-w-0`: a grid item's minimum is its min-content, and one long product name would widen the column. */}
            <div className="min-w-0">
              <WishlistList initial={list} />
            </div>

            <aside className="grid min-w-0 gap-4">
              {list.alerts_off && (
                <Alert tone="info" title="Emails about this list are off" dismissible={false}>
                  You pressed the stop link in one of them. Your list is still here.
                  <div className="mt-3"><WishlistAlertsToggle on /></div>
                </Alert>
              )}

              {guestWithoutAddress && (
                <Card as="section" interactive={false} padding="md">
                  <h2 className="text-15 font-semibold">Email me about these</h2>
                  <p className="mt-1 mb-4 text-13-5 text-muted">
                    One message when something here is back in stock or its price comes down — never
                    between 9pm and 9am, and a link to stop them in every one.
                  </p>
                  <WishlistEmailForm />
                </Card>
              )}

              <Card as="section" interactive={false} padding="md">
                <h2 className="text-15 font-semibold">{list.account ? "Saved to your account" : "Saved in this browser"}</h2>
                <p className="mt-1 text-13-5 text-muted">
                  {list.account ? (
                    <>
                      It is the same list as <Link href="/portal/wishlist" className="underline">Wishlist in your portal</Link>,
                      and we email you when something on it is back in stock or cheaper.
                    </>
                  ) : (
                    <>
                      This list lives in this browser.
                      {portal && (
                        <>
                          {" "}<Link href="/portal/login" className="underline">Sign in</Link> and
                          it moves to your account, where you can reach it from anywhere.
                        </>
                      )}
                    </>
                  )}
                </p>
              </Card>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}

function stripToken(list: NonNullable<Awaited<ReturnType<typeof getWishlist>>>): VisibleWishlist {
  const { token: _token, ...visible } = list;
  void _token;

  return visible;
}
