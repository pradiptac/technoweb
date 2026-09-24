import { PageHero } from "@/components/ui/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { cancelStockNotice } from "@/lib/store";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

/**
 * The page the "cancel the notice" link in a back-in-stock email lands on.
 *
 * It calls the API on render and shows the outcome — the newsletter's
 * unsubscribe shape, and for the same reason: every obstacle between
 * deciding to stop and stopping is a complaint instead. The API is
 * idempotent and answers the same sentence for a link already used and a
 * token nobody has, so this page has one message and no branch to get
 * wrong. `noindex`: a token in a URL is one person's.
 *
 * Deliberately not ISR-cached and without `generateStaticParams`: the
 * render is the action, and a cached copy would show "done" without doing
 * anything the second time round.
 */
export const metadata = buildMetadata({
  title: "Notice cancelled",
  path: "/store/notify/cancel",
  seo: noIndex,
});

export const dynamic = "force-dynamic";

export default async function CancelStockNoticePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let message: string | null = null;

  try {
    message = await cancelStockNotice(token);
  } catch {
    // Left null: the page says so rather than pretending.
  }

  return (
    <>
      <PageHero section="store" title="Back-in-stock notice" lede="One click, and nothing else to do." crumbs={[{ name: "Store", path: "/store" }]} />

      <div className="section-y">
        <div className="mx-auto w-[90%] max-w-[560px]">
          {message ? (
            <Alert tone="ok" title="Cancelled" dismissible={false}>{message}</Alert>
          ) : (
            <Alert tone="err" title="We could not reach the shop just now" dismissible={false}>
              Try the link again in a moment. Nothing else is needed.
            </Alert>
          )}

          <div className="mt-6">
            <ButtonLink href="/store" variant="secondary">Back to the shop</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
