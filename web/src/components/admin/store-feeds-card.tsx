import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CopyLink } from "@/components/ui/copy-link";
import { SITE } from "@/lib/seo";

/**
 * The shop's feeds, where somebody connecting a platform will look for them
 * (2026-09-18 for Google, 2026-09-26 for Meta): the address to paste, a copy
 * button and a download for each.
 *
 * The addresses are absolute on the production origin — that is the string a
 * platform is given, and the console's rule about paths is about links a
 * person clicks from wherever the console runs. The downloads are plain
 * `<a download>` at a path, **never a `Link`**: a `next/link` at a route
 * handler prefetches it, and each of these builds the whole feed.
 *
 * `metaEnabled` is the `meta_catalogue_enabled` setting as the page read it;
 * off, the two Meta addresses answer 404 and the card says so rather than
 * offering links that go nowhere.
 */
export function StoreFeedsCard({ metaEnabled }: { metaEnabled: boolean }) {
  const origin = SITE.url.replace(/\/$/, "");
  const feeds = [
    { name: "Google Merchant Center", path: "/google-shopping-feed.xml", download: "Download the XML", on: true },
    { name: "Meta catalogue (Facebook, Instagram, WhatsApp)", path: "/meta-catalogue.xml", download: "Download the XML", on: metaEnabled },
    { name: "Meta catalogue as CSV", path: "/meta-catalogue.csv", download: "Download the CSV", on: metaEnabled },
  ];

  return (
    <Card interactive={false} padding="sm" className="mb-5 grid gap-2.5 text-13">
      <span className="font-medium text-ink">Shopping feeds</span>

      <ul className="grid gap-2">
        {feeds.map((feed) => {
          const url = `${origin}${feed.path}`;
          return (
            <li key={feed.path} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-full text-12-5 font-medium text-muted sm:w-64 sm:shrink-0">{feed.name}</span>
              {feed.on ? (
                <>
                  <code className="min-w-0 flex-1 truncate font-mono text-12-5 text-muted" title={url}>{url}</code>
                  <CopyLink url={url} className="grid size-7 place-items-center rounded-md border border-line text-muted hover:text-ink" />
                  <a href={feed.path} download className="text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
                    {feed.download}
                  </a>
                </>
              ) : (
                <span className="min-w-0 flex-1 text-12-5 text-muted">
                  Switched off in <Link href="/admin/store/settings" className="underline">Store settings</Link>.
                </span>
              )}
            </li>
          );
        })}
        {/*
          The catalogue as a spreadsheet — every product and variation in
          the columns the import reads back, so "change forty prices" is
          export, edit, import. The same plain `<a download>`, for the same
          reason: this route handler builds the whole file.
        */}
        <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-full text-12-5 font-medium text-muted sm:w-64 sm:shrink-0">The catalogue, to edit</span>
          <a href="/api/admin/store/products/export" download className="text-12-5 font-medium text-brand-ink underline-offset-2 hover:underline">
            Export the catalogue (CSV)
          </a>
          <span className="text-12-5 text-muted">
            — edit it and <Link href="/admin/store/products/import" className="underline">import</Link> it back.
          </span>
        </li>
      </ul>

      <details className="text-12-5 text-muted">
        <summary className="cursor-pointer font-medium text-ink">How to connect them</summary>
        <div className="measure mt-2 grid gap-2">
          <p>
            <strong className="text-ink">Google.</strong> Merchant Center → Products → Feeds → add a scheduled fetch,
            and paste the Google address. It is rebuilt from what is published here.
          </p>
          <p>
            <strong className="text-ink">Facebook and Instagram.</strong> Commerce Manager → your catalogue → Data
            sources → Data feed → Scheduled feed, and paste the Meta XML address (or the CSV one). Choose a daily
            schedule; prices are in rupees and include GST.
          </p>
          <p>
            <strong className="text-ink">WhatsApp.</strong> WhatsApp Business Manager → Catalogue → connect the same
            Commerce Manager catalogue. There is no separate WhatsApp feed: it lists what Meta&apos;s catalogue holds.
          </p>
          <p>
            A product left out of the Google feed — withheld, a service, or with no JPEG, PNG or WebP picture — is
            left out of both. No stock count is published to either.
          </p>
        </div>
      </details>
    </Card>
  );
}
