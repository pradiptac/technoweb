import Link from "next/link";
import { PerPage } from "@/components/ui/per-page";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types/api";

/**
 * The bar under every list: how many rows to show, and where you are in them.
 *
 * Both halves keep their state in the query string. A sized, filtered, paged
 * view is a thing people bookmark and send each other, and it has to survive
 * the reload that every save and delete performs.
 */
export function Pagination({
  meta, basePath, params = {}, showPerPage = true,
}: {
  meta: Paginated<unknown>["meta"];
  basePath: string;
  params?: Record<string, string | undefined>;
  /**
   * The per-page control beside the numbers.
   *
   * Right in the console, where somebody works a list all day and 25 rows is a
   * decision they want. Wrong on a public blog: it is a setting nobody came to
   * change, and it puts a select in the middle of a reading page.
   */
  showPerPage?: boolean;
}) {
  const hrefFor = (page: number) => {
    const qp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") qp.set(key, value);
    }
    qp.set("page", String(page));
    return `${basePath}?${qp.toString()}`;
  };

  const from = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const to = Math.min(meta.current_page * meta.per_page, meta.total);
  const first = meta.current_page <= 1;
  const last = meta.current_page >= meta.last_page;

  const step =
    "grid size-8 place-items-center border-line-strong text-[15px] leading-none transition-colors";

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      {/*
       * The count is here even on a single page. This used to return null
       * whenever everything fitted, which took the record count away with the
       * pager — and one page is exactly when nothing else on the screen
       * answers "how many of these are there?".
       */}
      <p className="text-[13px] text-muted">
        {meta.total === 0
          ? "No records"
          : <>Showing <strong className="font-semibold text-ink">{from}–{to}</strong> of {meta.total}</>}
      </p>

      <div className="flex items-center gap-2">
        {showPerPage && <PerPage current={meta.per_page} basePath={basePath} params={params} />}

        {meta.last_page > 1 && (
          <div className="flex items-center rounded border border-line-strong bg-card">
            {first ? (
              <span aria-hidden className={cn(step, "border-r text-faint")}>‹</span>
            ) : (
              <Link
                href={hrefFor(meta.current_page - 1)}
                rel="prev"
                aria-label="Previous page"
                className={cn(step, "border-r text-muted hover:bg-surface-2 hover:text-ink")}
              >
                ‹
              </Link>
            )}

            <span className="px-3 text-[12.5px] font-medium text-ink tabular-nums">
              {from} – {to}
            </span>

            {last ? (
              <span aria-hidden className={cn(step, "border-l text-faint")}>›</span>
            ) : (
              <Link
                href={hrefFor(meta.current_page + 1)}
                rel="next"
                aria-label="Next page"
                className={cn(step, "border-l text-muted hover:bg-surface-2 hover:text-ink")}
              >
                ›
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
