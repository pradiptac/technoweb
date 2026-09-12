import { IconArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Certification } from "@/types/api";

/**
 * The company's certifications, as cards: the badge in a fixed square well,
 * then the name, the issuer, the certificate number in mono (it is data),
 * the validity, and a link to the PDF when there is one.
 *
 * The API has already dropped anything lapsed; nothing here has to check.
 */
export function CertificationCards({
  items, headingLevel = 3, className,
}: {
  items: Certification[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  if (items.length === 0) return null;

  const Heading = `h${headingLevel}` as "h2" | "h3";

  return (
    <ul className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {items.map((c) => (
        <li key={c.id} className="flex gap-4 rounded-lg border-2 border-line-strong bg-card p-4">
          <span className="relative block size-20 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image} alt={c.image_alt} loading="lazy" className="absolute inset-0 size-full object-contain p-2" />
            ) : (
              <span aria-hidden className="grid size-full place-items-center font-display text-[22px] font-semibold text-faint">
                {c.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>

          <div className="min-w-0">
            <Heading className="text-[15.5px] font-semibold leading-snug">{c.name}</Heading>
            {c.issuer && <p className="mt-0.5 text-[13px] text-muted">{c.issuer}</p>}
            {c.certificate_number && (
              <p className="mt-2 font-mono text-[12px] text-faint">{c.certificate_number}</p>
            )}
            {(c.issued_on || c.valid_until) && (
              <p className="mt-1 text-[12.5px] text-muted">
                {c.issued_on && <>Issued {formatDate(c.issued_on)}</>}
                {c.issued_on && c.valid_until && " · "}
                {c.valid_until && <>Valid until {formatDate(c.valid_until)}</>}
              </p>
            )}
            {c.description && <p className="mt-2 text-[13px] leading-[1.55] text-ink-2">{c.description}</p>}
            {c.file && (
              <a
                href={c.file}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline"
              >
                View certificate (PDF) <IconArrowRight className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
