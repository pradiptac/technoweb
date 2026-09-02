import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BlogCategorySummary } from "@/types/api";

/**
 * The categories a post is filed under, as links.
 *
 * Links rather than decoration: a badge that looks like a control and does
 * nothing is the thing a reader tries once and stops trusting. Each goes to
 * the filtered listing, which is the whole reason the taxonomy has slugs.
 *
 * `dot={false}` — a dotted pill reads as a *state* (open, overdue, paid),
 * which is what every other badge in this product stands for. A category is a
 * label, and a row of dotted labels looks like a status list.
 *
 * Capped, because a post filed under six categories would otherwise push the
 * title off a card at 320px. The overflow is counted rather than dropped
 * silently: "+2" is honest and takes one chip's room.
 */
export function CategoryChips({
  categories, limit = 3, className,
}: {
  categories?: BlogCategorySummary[] | null;
  limit?: number;
  className?: string;
}) {
  if (!categories || categories.length === 0) return null;

  const shown = categories.slice(0, limit);
  const rest = categories.length - shown.length;

  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((category) => (
        <li key={category.id}>
          <Link
            href={`/blog/category/${category.slug}`}
            className="rounded-full transition-opacity hover:opacity-80"
          >
            <Badge tone="brand" dot={false}>{category.name}</Badge>
          </Link>
        </li>
      ))}

      {rest > 0 && (
        <li>
          <Badge tone="closed" dot={false}>+{rest}</Badge>
        </li>
      )}
    </ul>
  );
}
