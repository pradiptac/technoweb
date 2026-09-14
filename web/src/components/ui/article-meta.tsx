import { cn } from "@/lib/utils";
import { formatDate as formatDateFrom } from "@/lib/dates";

/**
 * Kept as an export for its nine importers; the implementation is
 * `lib/dates.ts` (`long`, and an empty string rather than a dash for null,
 * because a byline with no date shows nothing rather than a placeholder).
 */
export const formatDate = (iso: string | null) => formatDateFrom(iso, "long", "");

/** Consistent date formatting across every article surface. */
export function ArticleMeta({
  date, readingMinutes, author, category, className,
}: {
  date?: string | null;
  readingMinutes?: number | null;
  author?: string | null;
  category?: string | null;
  className?: string;
}) {
  const parts = [
    category,
    date ? formatDate(date) : null,
    readingMinutes ? `${readingMinutes} min read` : null,
    author,
  ].filter(Boolean);

  if (!parts.length) return null;

  return (
    <p className={cn("text-13 text-muted", className)}>
      {parts.map((p, i) => (
        <span key={p as string}>
          {i > 0 && <span aria-hidden className="px-1.5 opacity-50">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
