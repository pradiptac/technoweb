import { PageHero } from "@/components/ui/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { stopWishlistAlerts } from "@/lib/wishlist";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

/**
 * Where the "stop these emails" link in a back-in-stock or price-drop email
 * lands. The back-in-stock notice's cancel page exactly: it calls the API on
 * render and shows the one sentence the API answers for every token — used,
 * unknown or real — so the page has no branch to get wrong and the link
 * cannot be used to test which tokens exist. It stops the list's emails and
 * nothing else; the list is still there.
 *
 * Dynamic and never cached: the render is the action. `noindex`: a token in
 * a URL is one person's.
 */
export const metadata = buildMetadata({
  title: "Wishlist emails stopped",
  path: "/store/wishlist/stop",
  seo: noIndex,
});

export const dynamic = "force-dynamic";

export default async function StopWishlistEmailsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let message: string | null = null;

  try {
    message = await stopWishlistAlerts(token);
  } catch {
    // Left null: the page says so rather than pretending.
  }

  return (
    <>
      <PageHero section="store" title="Wishlist emails" lede="One click, and nothing else to do." crumbs={[{ name: "Store", path: "/store" }]} />

      <div className="section-y">
        <div className="mx-auto w-[90%] max-w-[560px]">
          {message ? (
            <Alert tone="ok" title="Stopped" dismissible={false}>{message}</Alert>
          ) : (
            <Alert tone="err" title="We could not reach the shop just now" dismissible={false}>
              Try the link again in a moment. Nothing else is needed.
            </Alert>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/store/wishlist" variant="secondary">Your wishlist</ButtonLink>
            <ButtonLink href="/store" variant="secondary">Back to the shop</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
