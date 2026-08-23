import Link from "next/link";
import type { Paginated } from "@/types/api";

/**
 * Prev/Next pager that preserves whatever filter query params are already on
 * the page. Generalises the pattern portal/(app)/tickets/page.tsx hand-rolled
 * for its single `status` filter — every future admin list screen needs this.
 */
export function Pagination({
  meta, basePath, params = {},
}: {
  meta: Paginated<unknown>["meta"];
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const hrefFor = (page: number) => {
    const qp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) qp.set(key, value);
    }
    qp.set("page", String(page));
    return `${basePath}?${qp.toString()}`;
  };

  /*
   * A single page still reports how many records there are.
   *
   * This used to return null whenever everything fitted on one page, which
   * took the count away with the pager — and one page is exactly when "how
   * many of these are there?" has no other answer on the screen. An audit of
   * this console concluded the admin had no pagination and no result counts
   * at all, because the seeded data fits on one page everywhere.
   */
  if (meta.last_page <= 1) {
    return (
      <p className="mt-7 text-[13px] text-muted">
        {meta.total} {meta.total === 1 ? "record" : "records"}
      </p>
    );
  }

  return (
    <nav className="mt-7 flex items-center justify-between gap-3" aria-label="Pagination">
      <span className="text-[13px] text-muted">
        Page {meta.current_page} of {meta.last_page} · {meta.total} total
      </span>
      <span className="flex gap-2">
        {meta.current_page > 1 && (
          <Link
            href={hrefFor(meta.current_page - 1)}
            className="rounded border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint"
          >
            Previous
          </Link>
        )}
        {meta.current_page < meta.last_page && (
          <Link
            href={hrefFor(meta.current_page + 1)}
            className="rounded border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] font-semibold hover:border-faint"
          >
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}
