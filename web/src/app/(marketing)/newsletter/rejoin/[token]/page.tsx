import { PageHero } from "@/components/ui/page-hero";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { clientIpHeaders } from "@/lib/client-ip";
import { getSiteSettings } from "@/lib/settings";
import { RejoinForm } from "./rejoin-form";
import { brandName } from "@/lib/brand";

/**
 * The page a rejoin link lands on (docs/newsletter.md, "Rejoining after an
 * unsubscribe").
 *
 * Somebody who unsubscribed signed up again; the API mailed them this link,
 * and pressing the button here is what lifts their unsubscribe. Opening the
 * page changes nothing — a mail scanner fetches links before people do, and a
 * GET that confirmed would put people back on a list because a filter looked
 * at their inbox.
 *
 * `noindex`, no analytics and `no-referrer`, like the unsubscribe page beside
 * it: the token in the path is a key (`next.config.ts`, `analytics.tsx`).
 */
export const metadata = buildMetadata({
  title: "Rejoin the newsletter",
  path: "/newsletter/rejoin",
  seo: noIndex,
});

export default async function RejoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /*
    Asked first so the page can name the address — and so a dead link says so
    before anybody presses a button that cannot work. Every dead link (unknown,
    expired, replaced by a newer one, or undone by a later unsubscribe) is one
    404 and one sentence here.
  */
  let email: string | null = null;
  let confirmed = false;
  let valid = false;

  try {
    const base = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
    const response = await fetch(`${base}/api/v1/newsletter/rejoin/${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json", ...(await clientIpHeaders()) },
      cache: "no-store",
    });

    if (response.ok) {
      const body = await response.json();
      email = body.data?.email ?? null;
      confirmed = Boolean(body.data?.confirmed);
      valid = true;
    }
  } catch {
    // Left invalid: the page says the link cannot be used, which is the truth
    // as far as this request could tell.
  }

  const settings = await getSiteSettings();
  const company = settings.company_name ?? brandName();

  return (
    <>
      <PageHero title="Rejoin the newsletter" lede="Confirm it, and you are back on the list." />

      <div className="section-y">
        <div className="mx-auto w-[90%] max-w-[560px]">
          <RejoinForm token={token} email={email} valid={valid} confirmed={confirmed} company={company} />
        </div>
      </div>
    </>
  );
}
