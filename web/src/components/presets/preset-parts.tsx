import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { initials } from "@/lib/initials";
import { blurProps } from "@/lib/blur";
import type {
  AwardData, CoverageData, InvestorData, PresetOption, PresetPicture, PresetRow, ReleaseData, TestimonialData,
} from "@/types/presets";

/*
 * The pieces every preset layout is drawn from (docs/content-presets.md),
 * shared by the archives and the builder's "From a preset" section so the
 * two cannot drift. Tokens only; every card stands on `bg-card`. Each piece
 * stamps `data-preset-item` so a theme may restyle it by attribute.
 */

/** The fields of an archive row or a builder row, the same shape for both. */
export type PresetEntry = Pick<PresetRow, "id" | "title" | "slug" | "path" | "summary" | "published_at" | "image" | "image_alt" | "image_focus" | "image_blur"> & {
  custom_data?: Record<string, unknown>;
};

export function dataOf<T>(entry: PresetEntry): T {
  return (entry.custom_data ?? {}) as T;
}

/** A label from a list of options, or the value itself. */
export function labelOf(options: PresetOption[] | undefined, value: string | undefined): string {
  if (!value) return "";
  return options?.find((o) => o.value === value)?.label ?? value;
}

/** Entries grouped under a key, in the order the keys first appear. */
export function groupBy<T>(rows: T[], key: (row: T) => string): { key: string; rows: T[] }[] {
  const out: { key: string; rows: T[] }[] = [];
  for (const row of rows) {
    const k = key(row);
    const hit = out.find((g) => g.key === k);
    if (hit) hit.rows.push(row);
    else out.push({ key: k, rows: [row] });
  }
  return out;
}

export function yearOf(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 4) : "";
}

function Picture({ picture, sizes, className }: { picture: PresetPicture; sizes: string; className?: string }) {
  return (
    <Image {...blurProps(picture.blur)} src={picture.url} alt={picture.alt ?? ""} fill sizes={sizes}
      className={className ?? "object-cover"} style={picture.focus ? { objectPosition: picture.focus } : undefined} />
  );
}

/** A press or investor contact. Nothing when nothing is set. */
export function ContactCard({ title, name, email, phone }: { title: string; name?: string; email?: string; phone?: string }) {
  if (!name && !email && !phone) return null;
  return (
    <Card interactive={false} padding="md" className="h-full" >
      <h3 className="text-15 font-semibold text-ink">{title}</h3>
      <dl className="mt-3 space-y-1.5 text-14 text-ink-2">
        {name ? <div><dt className="sr-only">Name</dt><dd>{name}</dd></div> : null}
        {email ? <div><dt className="sr-only">Email</dt><dd><a className="font-semibold text-brand-ink underline-offset-2 hover:underline" href={`mailto:${email}`}>{email}</a></dd></div> : null}
        {phone ? <div><dt className="sr-only">Telephone</dt><dd><a className="font-semibold text-brand-ink underline-offset-2 hover:underline" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a></dd></div> : null}
      </dl>
    </Card>
  );
}

/** One press release in a dated list. */
export function ReleaseRow({ entry, headingAs = "h3" }: { entry: PresetEntry; headingAs?: "h2" | "h3" }) {
  const H = headingAs;
  const d = dataOf<ReleaseData>(entry);
  return (
    <li data-preset-item="" className="border-b border-line py-5 first:pt-0 last:border-b-0">
      <p className="text-13 text-muted">
        <time dateTime={entry.published_at ?? undefined}>{formatDate(entry.published_at, "long")}</time>
        {d.dateline ? <span>, {d.dateline}</span> : null}
      </p>
      <H className="mt-1 text-17 font-semibold leading-snug text-ink">
        <Link href={entry.path} className="hover:text-brand-ink">{entry.title}</Link>
      </H>
      {entry.summary ? <p className="mt-1.5 text-15 text-ink-2">{entry.summary}</p> : null}
    </li>
  );
}

/** A piece of coverage: the publication, the headline, an outbound link. */
export function CoverageCard({ entry, headingAs = "h3" }: { entry: PresetEntry; headingAs?: "h2" | "h3" }) {
  const H = headingAs;
  const d = dataOf<CoverageData>(entry);
  return (
    <Card as="li" interactive={false} padding="md" className="flex h-full flex-col">
      <div data-preset-item="" className="flex h-full flex-col">
        <div className="flex h-10 items-center">
          {d.publication_logo?.url ? (
            <span className="relative block h-8 w-32">
              <Picture picture={d.publication_logo} sizes="128px" className="object-contain object-left" />
            </span>
          ) : (
            <span className="text-15 font-semibold text-secondary-ink">{d.publication}</span>
          )}
        </div>
        <H className="mt-3 text-15 font-semibold leading-snug text-ink">{entry.title}</H>
        {entry.summary ? <p className="mt-2 text-14 text-ink-2">{entry.summary}</p> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-13">
          <span className="text-muted">
            {d.publication_logo?.url && d.publication ? <span className="block font-semibold text-ink-2">{d.publication}</span> : null}
            <time dateTime={d.coverage_date ?? entry.published_at ?? undefined}>{formatDate(d.coverage_date ?? entry.published_at, "long")}</time>
          </span>
          {d.article_url ? (
            <a href={d.article_url} target="_blank" rel="noopener" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
              Read the article<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** One investor document: date, title, kind, and the file. */
export function InvestorRow({ entry, types }: { entry: PresetEntry; types?: PresetOption[] }) {
  const d = dataOf<InvestorData>(entry);
  const ext = d.document?.name?.split(".").pop()?.toUpperCase();
  return (
    <li id={`entry-${entry.id}`} data-preset-item="" className="flex scroll-mt-28 flex-col gap-2 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6">
      <span className="text-13 text-muted sm:w-32 sm:shrink-0">{formatDate(d.document_date ?? entry.published_at, "short")}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-semibold text-ink">{entry.title}</span>
        {d.document_type ? <span className="mt-0.5 block text-13 text-ink-2">{labelOf(types, d.document_type)}</span> : null}
      </span>
      {d.document?.url ? (
        <a href={d.document.url} download className="inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start rounded-md border border-line-strong bg-card px-4 text-14 font-semibold text-brand-ink hover:border-brand-ink/40 sm:self-auto">
          Download{ext ? <span className="text-12-5 font-semibold text-muted">{ext}</span> : null}
          <span className="sr-only"> {entry.title}</span>
        </a>
      ) : null}
    </li>
  );
}

/** A testimonial as a quote card. */
export function QuoteCard({ entry }: { entry: PresetEntry }) {
  const d = dataOf<TestimonialData>(entry);
  const role = [d.role, d.company].filter(Boolean).join(", ");
  return (
    <Card as="li" interactive={false} padding="md" className="mb-6 break-inside-avoid">
      <figure data-preset-item="">
        <blockquote className="text-15 leading-relaxed text-ink">“{d.quote}”</blockquote>
        <figcaption className="mt-5 flex items-center gap-3">
          {d.photo?.url ? (
            <span className="relative block size-11 shrink-0 overflow-hidden rounded-full">
              <Picture picture={d.photo} sizes="44px" />
            </span>
          ) : (
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-14 font-semibold text-brand-ink">
              {initials(entry.title)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-14 font-semibold text-ink">{entry.title}</span>
            {role ? <span className="block text-13 text-ink-2">{role}</span> : null}
          </span>
          {d.company_logo?.url ? (
            <span className="relative block h-7 w-20 shrink-0">
              <Picture picture={d.company_logo} sizes="80px" className="object-contain object-right" />
            </span>
          ) : null}
        </figcaption>
      </figure>
    </Card>
  );
}

/** An award: the badge, its name, who gave it. */
export function AwardBadge({ entry, headingAs = "h3" }: { entry: PresetEntry; headingAs?: "h2" | "h3" }) {
  const H = headingAs;
  const d = dataOf<AwardData>(entry);
  const title = d.link
    ? <a href={d.link} target="_blank" rel="noopener" className="hover:text-brand-ink">{entry.title}<span className="sr-only"> (opens in a new tab)</span></a>
    : entry.title;
  return (
    <Card as="li" interactive={false} padding="md" className="h-full text-center">
      <div data-preset-item="" className="flex h-full flex-col items-center">
        {/* No badge, no well: a placeholder would only repeat the year the section is headed by. */}
        {d.badge?.url ? (
          <div className="relative mb-4 h-24 w-full"><Picture picture={d.badge} sizes="200px" className="object-contain" /></div>
        ) : null}
        <H className="text-15 font-semibold leading-snug text-ink">{title}</H>
        <p className="mt-1 text-14 text-ink-2">{d.awarding_body}</p>
        {d.category ? <p className="mt-1 text-13 text-muted">{d.category}</p> : null}
      </div>
    </Card>
  );
}
