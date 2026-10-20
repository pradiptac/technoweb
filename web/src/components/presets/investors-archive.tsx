import Link from "next/link";
import { NewsletterSignup } from "@/components/layout/newsletter-signup";
import { Card } from "@/components/ui/card";
import { settingEnabled, type SiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { Archive } from "@/app/(marketing)/[slug]/archive";
import type { InvestorData } from "@/types/presets";
import { ArchiveShell } from "./archive-shell";
import { ContactCard, InvestorRow, dataOf, groupBy, labelOf, type PresetEntry } from "./preset-parts";

/**
 * The investors page (docs/content-presets.md): documents grouped by financial
 * year, newest first, with a chip per document type that filters the list
 * (`?type=`, links, so it works without JavaScript and a filtered view is
 * `noindex`), a signup band for the email alert and the investor contact.
 */
export function InvestorsArchive({ archive, settings, query }: {
  archive: Archive;
  settings: SiteSettings;
  query: { type?: string; year?: string };
}) {
  const { type, entries } = archive;
  const types = entries.meta.document_types ?? [];
  const rows = entries.data as PresetEntry[];
  const groups = groupBy(rows, (e) => dataOf<InvestorData>(e).financial_year ?? "")
    .sort((a, b) => b.key.localeCompare(a.key));
  const signup = settingEnabled(settings, "newsletter_signup_enabled", true);
  const contact = { name: settings.investors_contact_name, email: settings.investors_contact_email, phone: settings.investors_contact_phone };

  const chip = (value: string | undefined, label: string) => {
    const active = (query.type ?? "") === (value ?? "");
    return (
      <li key={value ?? "all"}>
        <Link
          href={value ? `${type.path}?type=${encodeURIComponent(value)}` : type.path}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[40px] items-center rounded-full border px-4 text-14 font-semibold transition-colors duration-(--duration-fast)",
            active ? "border-brand-600 bg-brand-600 text-brand-on" : "border-line-strong bg-card text-ink-2 hover:border-brand-ink/40 hover:text-brand-ink",
          )}
        >
          {label}
        </Link>
      </li>
    );
  };

  return (
    <ArchiveShell archive={archive} params={{ type: query.type, year: query.year }} after={(
      <div className={cn("mt-16 grid gap-6", signup && (contact.name || contact.email || contact.phone) && "lg:grid-cols-[7fr_5fr]")}>
        {signup ? (
          <Card interactive={false} padding="lg">
            <h2 className="display-3 text-ink">Get investor updates</h2>
            <p className="mb-5 mt-2 text-15 text-ink-2">
              {settings.investors_signup_line ?? "An email when we publish results, reports and notices. Nothing else."}
            </p>
            <NewsletterSignup list="investors" label="Your email address, to be told when an investor document is published" />
          </Card>
        ) : null}
        <ContactCard title="Investor contact" {...contact} />
      </div>
    )} before={types.length > 0 ? (
      <nav aria-label="Document types" className="mb-10">
        <ul className="flex flex-wrap gap-2">
          {chip(undefined, "All documents")}
          {types.map((t) => chip(t.value, t.label))}
        </ul>
      </nav>
    ) : null} empty={query.type ? (
      <p className="text-15 text-ink-2">
        No {labelOf(types, query.type).toLocaleLowerCase("en-IN")} yet.{" "}
        <Link href={type.path} className="font-semibold text-brand-ink underline">See every document</Link>.
      </p>
    ) : undefined}>

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`fy-${g.key}`} className="mt-10 first:mt-0">
          <h2 id={`fy-${g.key}`} className="mb-2 text-17 font-semibold text-ink">
            {g.key ? `Financial year ${g.key}` : "Other documents"}
          </h2>
          <ul className="border-t border-line">
            {g.rows.map((e) => <InvestorRow key={e.id} entry={e} types={types} />)}
          </ul>
        </section>
      ))}
    </ArchiveShell>
  );
}
