import { IconArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Certification } from "@/types/api";
import Image from "next/image";
import { formatDate } from "@/lib/dates";

/** A bare `YYYY-MM-DD`; unparseable stays as typed rather than becoming a dash. */
const formatMonthYear = (iso: string) => formatDate(iso, "monthYear", iso);

/**
 * The company's certifications, as cards: the certificate in a fixed **3:4
 * portrait** well — it is a sheet of paper, and the form asks for it that
 * way — then the name, the issuer, the certificate number in mono (it is
 * data), the validity, and a link to the PDF when there is one.
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
        <li key={c.id} data-card className="flex gap-4 rounded-lg border-2 border-line-strong bg-card p-4">
          <span className="relative block aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
            {c.image ? (
              <Image src={c.image} alt={c.image_alt} fill sizes="112px" className="object-cover" />
            ) : (
              <span aria-hidden className="grid size-full place-items-center font-display text-22 font-semibold text-faint">
                {c.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>

          <div className="min-w-0">
            <Heading className="text-15-5 font-semibold leading-snug">{c.name}</Heading>
            {c.issuer && <p className="mt-0.5 text-13 text-muted">{c.issuer}</p>}
            {c.certificate_number && (
              <p className="mt-2 font-mono text-12 text-faint">{c.certificate_number}</p>
            )}
            {(c.issued_on || c.valid_until) && (
              <p className="mt-1 text-12-5 text-muted">
                {c.issued_on && <>Issued {formatMonthYear(c.issued_on)}</>}
                {c.issued_on && c.valid_until && " · "}
                {c.valid_until && <>Valid until {formatMonthYear(c.valid_until)}</>}
              </p>
            )}
            {c.description && <p className="mt-2 text-13 leading-[1.55] text-ink-2">{c.description}</p>}
            {c.file && (
              <a
                href={c.file}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-13 font-semibold text-brand-ink hover:underline"
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

