import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Prose } from "@/components/ui/prose";
import { cn } from "@/lib/utils";
import type { PublicCustomField } from "@/types/api";

/**
 * A record's custom fields, drawn after its body (docs/custom-content.md).
 *
 * The API decides what arrives — the fields of `details` groups marked to
 * show, with anything empty left out — and resolves each value to what can
 * be drawn: a picture to its URL and alt, a linked record to its title and
 * **path**, rich text already cleaned on write. So this renders and never
 * decides; nothing here knows which fields exist.
 *
 * A definition list on a `Card` ground, tokens only. Nothing when the list is
 * empty, so a record nobody has filled in shows no heading over nothing.
 */
export function CustomFieldDetails({
  fields, title = "Details", className,
}: {
  fields?: PublicCustomField[] | null;
  title?: string;
  className?: string;
}) {
  if (!fields || fields.length === 0) return null;

  return (
    <section className={cn("min-w-0", className)} aria-labelledby="custom-field-details" data-aos="fade-up">
      <h2 id="custom-field-details" className="display-3 mb-5">{title}</h2>
      <Card as="div" interactive={false} padding="lg">
        <dl className="divide-y divide-line">
          {fields.map((f) => (
            <div key={f.key} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-8">
              <dt className="text-13-5 font-semibold text-muted">{f.label}</dt>
              <dd className="min-w-0 text-15 leading-[1.6] text-ink [overflow-wrap:anywhere]">
                <Value field={f} />
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function Value({ field }: { field: PublicCustomField }) {
  const v = field.value;

  switch (field.kind) {
    case "rich_text":
      return typeof v === "string" ? <Prose html={v} /> : null;

    case "textarea":
      return <span className="whitespace-pre-line">{field.display}</span>;

    case "url":
      return typeof v === "string"
        ? <a href={v} rel="noopener" className="font-semibold text-brand-ink underline-offset-2 hover:underline">{field.display}</a>
        : null;

    case "email":
      return typeof v === "string"
        ? <a href={`mailto:${v}`} className="font-semibold text-brand-ink underline-offset-2 hover:underline">{v}</a>
        : null;

    case "relation": {
      const link = v as { title?: string; path?: string } | null;
      return link?.path
        ? <Link href={link.path} className="font-semibold text-brand-ink underline-offset-2 hover:underline">{link.title}</Link>
        : null;
    }

    case "file": {
      const file = v as { url?: string; name?: string } | null;
      return file?.url
        ? <a href={file.url} className="font-semibold text-brand-ink underline-offset-2 hover:underline">{file.name ?? field.display}</a>
        : null;
    }

    case "image": {
      const img = v as { url?: string; alt?: string; focus?: string | null; width?: number | null; height?: number | null } | null;
      if (!img?.url) return null;
      return (
        <Image
          src={img.url}
          alt={img.alt ?? field.label}
          width={img.width || 1200}
          height={img.height || 800}
          sizes="(min-width: 768px) 480px, 100vw"
          className="h-auto w-full max-w-[480px] rounded border border-line"
          style={img.focus ? { objectPosition: img.focus } : undefined}
        />
      );
    }

    case "multi_select":
    case "list": {
      const items = Array.isArray(v) ? v.map(String) : [];
      const labels = field.kind === "multi_select" ? field.display.split(", ") : items;
      return (
        <ul className="flex flex-wrap gap-2">
          {labels.map((item) => (
            <li key={item} className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-13-5">{item}</li>
          ))}
        </ul>
      );
    }

    default:
      return <>{field.display}</>;
  }
}
