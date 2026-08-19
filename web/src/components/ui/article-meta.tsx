import { cn } from "@/lib/utils";

/** Consistent date formatting across every article surface. */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

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
    <p className={cn("text-[13px] text-muted", className)}>
      {parts.map((p, i) => (
        <span key={p as string}>
          {i > 0 && <span aria-hidden className="px-1.5 opacity-50">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
