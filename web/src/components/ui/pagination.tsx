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
  meta, basePath, params = {}, showPerPage = true, numbered = false,
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
  /**
   * Page numbers instead of the compact `‹ 1–12 ›` strip.
   *
   * The compact strip is right for a console list, where the count is what
   * matters and the pager is worked one page at a time. A blog is browsed —
   * a reader jumps to the last page, or back to where they were — so it
   * gets the first, the last, the current and its neighbours, with an
   * ellipsis where pages are skipped. Never more than seven numbers, so it
   * fits a phone; the ellipsis is text, not a target.
   */
  numbered?: boolean;
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

  if (numbered) {
    return (
      <nav className="mt-8 flex flex-wrap items-center gap-2" aria-label="Pagination">
        {pageWindow(meta.current_page, meta.last_page).map((page, i) =>
          page === null ? (
            <span key={`gap-${i}`} aria-hidden className="grid size-11 place-items-center rounded-sm border border-brand-ink/45 bg-card text-[15px] text-brand-ink">
              …
            </span>
          ) : page === meta.current_page ? (
            <span
              key={page}
              aria-current="page"
              className="grid size-11 place-items-center rounded-sm border border-brand-600 bg-brand-600 text-[15px] font-medium text-brand-on tabular-nums"
            >
              {page}
            </span>
          ) : (
            <Link
              key={page}
              href={hrefFor(page)}
              aria-label={`Page ${page}`}
              className="grid size-11 place-items-center rounded-sm border border-brand-ink/45 bg-card text-[15px] font-medium text-brand-ink tabular-nums transition-colors hover:border-brand-ink hover:bg-brand-50"
            >
              {page}
            </Link>
          ),
        )}

        {!last && (
          <Link
            href={hrefFor(meta.current_page + 1)}
            rel="next"
            className="grid h-11 place-items-center rounded-sm border border-ink/50 bg-card px-4 text-[15px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface-2"
          >
            Next →
          </Link>
        )}
      </nav>
    );
  }

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

/**
 * The pages to show: 1 … current−1, current, current+1 … last. A `null` is
 * an ellipsis. Adjacent numbers are never bridged by an ellipsis — `1 … 3`
 * hides exactly one page, and a control that hides one page is worse than
 * the page.
 */
function pageWindow(current: number, last: number): (number | null)[] {
  const want = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last));
  const pages = [...want].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const [i, n] of pages.entries()) {
    const prev = pages[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) out.push(null);
    out.push(n);
  }
  return out;
}
