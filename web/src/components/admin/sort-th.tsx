import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A sortable column heading for an admin list.
 *
 * Renders the `<th>` with a link carrying `?sort=<key>&dir=asc|desc` on top
 * of the list's current filters, so the ordering survives paging and a
 * filter change survives re-sorting. The first press sorts ascending, the
 * second flips it; the API's `ListSort` allowlists the key and falls back to
 * the list's own order for anything else, which is what makes a stale
 * bookmark harmless. `aria-sort` on the active column is how a screen reader
 * is told which way the table is ordered.
 *
 * A server component, deliberately: the heading is a link, not a control,
 * so the table sorts with no JavaScript and the URL says how it is sorted.
 */
export function SortTh({
  sortKey, label, basePath, params, sort, dir, className,
}: {
  sortKey: string;
  label: string;
  basePath: string;
  params: Record<string, string | undefined>;
  sort?: string;
  dir?: string;
  className?: string;
}) {
  const active = sort === sortKey;
  const direction = active && dir === "asc" ? "asc" : active ? "desc" : undefined;
  const nextDir = direction === "asc" ? "desc" : "asc";

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page" && k !== "sort" && k !== "dir") query.set(k, v);
  query.set("sort", sortKey);
  query.set("dir", nextDir);

  return (
    <th scope="col" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined} className={cn("px-3 py-1.5", className)}>
      <Link
        href={`${basePath}?${query.toString()}`}
        className={cn("inline-flex items-center gap-1 rounded hover:text-ink hover:underline", active && "text-ink")}
        title={`Sort by ${label.toLowerCase()}${active ? `, ${nextDir === "asc" ? "ascending" : "descending"}` : ""}`}
      >
        {label}
        <span aria-hidden className="inline-block w-2 text-10-5 leading-none">
          {direction === "asc" ? "▲" : direction === "desc" ? "▼" : ""}
        </span>
      </Link>
    </th>
  );
}
