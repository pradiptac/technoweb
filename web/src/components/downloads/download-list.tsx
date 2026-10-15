import { IconLock } from "@/components/icons";
import { IconDownload } from "@/components/icons-ui";
import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";
import type { Download } from "@/types/downloads";

/**
 * A list of files to download: one row each, read down a single column
 * (docs/downloads.md).
 *
 * One component for every place a file is offered — the downloads centre,
 * a product's page, the portal, and the page builder's downloads section —
 * so a file looks the same wherever it is met. A server component: nothing
 * here needs the browser.
 *
 * **The button is a plain `<a>`.** A centre file's address is this site's
 * `/api/downloads/{id}`, a route handler, and a `next/link` to one is
 * prefetched — which would count as a download. A file that only customers
 * may fetch carries no `download` attribute and opens in the same tab: a
 * visitor who is not signed in is sent to the sign-in page, and a `download`
 * attribute would save that page as the file.
 */

export type DownloadRow = {
  key: string | number;
  title: string;
  /** A sentence about the file, under its title. */
  summary?: string | null;
  /** Short facts on one line: version, date, size. */
  meta?: (string | null | undefined)[];
  extension?: string | null;
  href: string;
  /** Customers only. */
  locked?: boolean;
};

/** A centre download as a row. */
export function downloadRow(download: Download): DownloadRow {
  return {
    key: download.id,
    title: download.title,
    summary: download.summary,
    meta: [
      download.version ? `Version ${download.version}` : null,
      download.released_label,
      download.file ? formatBytes(download.file.size) : null,
    ],
    extension: download.file?.extension,
    href: downloadHref(download.id),
    locked: download.locked,
  };
}

/** Where the browser fetches a centre file. */
export function downloadHref(id: number): string {
  return `/api/downloads/${id}`;
}

export function DownloadList({
  rows, headingLevel = 3, className,
}: {
  rows: DownloadRow[];
  /** The level of each file's title; `null` for a list under no heading. */
  headingLevel?: 2 | 3 | 4 | null;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const Title = headingLevel ? (`h${headingLevel}` as "h2" | "h3" | "h4") : "p";

  return (
    <ul data-downloads className={cn("grid gap-3", className)}>
      {rows.map((row) => {
        const meta = (row.meta ?? []).filter(Boolean).join(" · ");

        return (
          <li
            key={row.key}
            data-card
            data-download
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-line-strong bg-card p-4 sm:flex-nowrap"
          >
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded border border-brand-ink/30 font-mono text-12 font-semibold uppercase text-brand-ink">
              {(row.extension ?? "file").slice(0, 4)}
            </span>
            {/* `basis-0` so the words take what the badge leaves on a phone,
                where the button drops to a row of its own under them. */}
            <div className="min-w-0 flex-1 basis-0">
              <Title className="text-15 font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{row.title}</Title>
              {row.summary && <p className="mt-0.5 text-13-5 leading-[1.5] text-muted">{row.summary}</p>}
              {(meta || row.locked) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted">
                  {row.locked && (
                    <span data-download-lock className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-0.5 text-12 font-semibold text-ink-2">
                      <IconLock className="size-3" aria-hidden />
                      Customers only
                    </span>
                  )}
                  {meta && <span>{meta}</span>}
                </p>
              )}
            </div>
            <a
              href={row.href}
              {...(row.locked ? {} : { target: "_blank" })}
              rel="noopener nofollow"
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-line-strong px-4 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base) hover:border-brand-ink hover:text-brand-ink sm:w-auto"
            >
              {row.locked ? <IconLock className="size-4" aria-hidden /> : <IconDownload className="size-4" aria-hidden />}
              <span>
                Download<span className="sr-only"> {row.title}{row.locked ? " (customers only — you will be asked to sign in)" : ""}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
