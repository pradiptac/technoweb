import { PageHero } from "@/components/ui/page-hero";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { UnsubscribeForm } from "./unsubscribe-form";

/**
 * The page an unsubscribe link lands on.
 *
 * `noindex`, obviously — a token in a URL is an identifier for one person, and
 * a search engine has no business holding it.
 */
export const metadata = buildMetadata({
  title: "Unsubscribe",
  path: "/newsletter/unsubscribe",
  seo: noIndex,
});

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /*
    The address is fetched here so the page can say which one is being
    unsubscribed — people forward newsletters, and somebody clicking a link in
    a message that reached them second-hand should see whose subscription this
    would end. The API returns the address and nothing else.
  */
  let email: string | null = null;
  let already = false;

  try {
    const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
    const response = await fetch(`${base}/api/v1/newsletter/unsubscribe/${token}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.ok) {
      const body = await response.json();
      email = body.data?.email ?? null;
      already = Boolean(body.data?.already);
    }
  } catch {
    // Left null: the form still works, it simply cannot name the address.
  }

  return (
    <>
      <PageHero title="Unsubscribe" lede="One click, and no account needed." />

      <div className="section-y">
        <div className="mx-auto w-[90%] max-w-[560px]">
          <UnsubscribeForm token={token} email={email} already={already} />
        </div>
      </div>
    </>
  );
}
