import { cn } from "@/lib/utils";
import type { Client } from "@/types/api";

/**
 * The logo wall.
 *
 * Each cell is a fixed 3:2 well with the logo `object-contain` inside it — a
 * logo is a mark and decides its own shape, so it is never cropped. The name
 * sits under the well (the caption rule), with the industry as a small
 * label; a client with a website is one outbound link around the whole
 * cell, `rel="noopener noreferrer"`, and one without is a plain cell.
 */
export function ClientWall({
  clients, headingLevel = 3, className,
}: {
  clients: Client[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  if (clients.length === 0) return null;

  const Heading = `h${headingLevel}` as "h2" | "h3";

  return (
    <ul className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {clients.map((c) => {
        const body = (
          <>
            <span className="relative block aspect-[3/2] w-full overflow-hidden rounded-md bg-surface-2">
              {c.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logo} alt="" loading="lazy" className="brand-logo absolute inset-0 size-full object-contain p-4" />
              ) : (
                <span aria-hidden className="grid size-full place-items-center text-center font-display text-[15px] font-semibold text-faint">
                  {c.name}
                </span>
              )}
            </span>
            <span className="mt-3 block">
              <Heading className="text-[14px] font-semibold leading-snug">{c.name}</Heading>
              {c.industry && <span className="mt-0.5 block text-[12px] text-muted">{c.industry.name}</span>}
              {c.note && <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-muted">{c.note}</span>}
            </span>
          </>
        );

        const cell = "block h-full rounded-lg border-2 border-line-strong bg-card p-3 transition-colors";

        return (
          <li key={c.id}>
            {c.website_url ? (
              <a
                href={c.website_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${c.name} (opens their website)`}
                className={cn(cell, "hover:border-brand-300")}
              >
                {body}
              </a>
            ) : (
              <div className={cell}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
