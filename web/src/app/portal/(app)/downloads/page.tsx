import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { DownloadList, downloadRow } from "@/components/downloads/download-list";
import { publicApi } from "@/lib/api";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { Download } from "@/types/downloads";

export const metadata = buildMetadata({ title: "Downloads", path: "/portal/downloads", seo: noIndex });

/**
 * The files only a signed-in customer may fetch (docs/downloads.md).
 *
 * The list itself is public knowledge — the downloads centre names these
 * files to everybody, with a lock — so this reads the same cached list,
 * narrowed to the customers-only ones. What being signed in changes is the
 * button: `/api/downloads/{id}` forwards the portal's token, and the API
 * hands the file over.
 */
export default async function PortalDownloadsPage() {
  let downloads: Download[];

  try {
    downloads = (await publicApi.downloads("?access=customers&per_page=100")).data;
  } catch {
    return (
      <ErrorState title="We could not load your downloads">
        Try again shortly, or raise a ticket and we will send you the file.
      </ErrorState>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 className="display-3 mb-1">Downloads</h2>
          <p className="measure text-14 text-muted">
            Firmware, software and documents kept for customers. Datasheets and everything else that
            is open to everybody are in the downloads centre.
          </p>
        </div>
        <Link
          href="/downloads"
          className="ml-auto inline-flex items-center rounded border border-line-strong px-4 py-[11px] text-13-5 font-semibold text-ink hover:border-brand-ink hover:text-brand-ink"
        >
          All downloads
        </Link>
      </div>

      {downloads.length === 0 ? (
        <EmptyState illustration="document" title="No customer files yet">
          <span className="block">
            Nothing is kept for customers only at the moment. Public files are in the{" "}
            <Link className="underline" href="/downloads">downloads centre</Link>.
          </span>
        </EmptyState>
      ) : (
        <DownloadList rows={downloads.map(downloadRow)} headingLevel={3} />
      )}
    </>
  );
}
