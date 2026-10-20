import type { ReactNode } from "react";
import { Prose } from "@/components/ui/prose";
import { formatDate } from "@/lib/dates";
import type { SiteSettings } from "@/lib/site-settings";
import type { ContentEntry } from "@/types/api";
import type { ReleaseData } from "@/types/presets";
import { ContactCard } from "./preset-parts";

/**
 * A press release's page (docs/content-presets.md): "For immediate release"
 * and the dateline before the body, then the release as a PDF, the company's
 * boilerplate and the media contact — this release's own when it names one,
 * else the newsroom's.
 */
export function ReleaseFrame({ record, settings, company, children }: {
  record: ContentEntry;
  settings: SiteSettings;
  company: string;
  children: ReactNode;
}) {
  const d = (record.custom_data ?? {}) as ReleaseData;
  const own = Boolean(d.contact_name || d.contact_email || d.contact_phone);
  const contact = own
    ? { name: d.contact_name, email: d.contact_email, phone: d.contact_phone }
    : { name: settings.newsroom_contact_name, email: settings.newsroom_contact_email, phone: settings.newsroom_contact_phone };
  const boilerplate = settings.newsroom_boilerplate;

  return (
    <>
      <p className="mb-2 text-14 font-semibold text-brand-ink">For immediate release</p>
      <p className="mb-6 text-15 font-semibold text-ink">
        {d.dateline ? `${d.dateline.toLocaleUpperCase("en-IN")}, ` : ""}
        <time dateTime={record.published_at ?? undefined}>{formatDate(record.published_at, "long")}</time> —
      </p>

      {children}

      {d.release_pdf?.url ? (
        <p className="mt-8">
          <a href={d.release_pdf.url} download className="inline-flex min-h-[44px] items-center rounded-md border border-line-strong bg-card px-4 text-14 font-semibold text-brand-ink hover:border-brand-ink/40">
            Download the release (PDF)
          </a>
        </p>
      ) : null}

      {boilerplate || contact.name || contact.email || contact.phone ? (
        <div className="mt-12 grid gap-6 lg:grid-cols-[7fr_5fr]">
          {boilerplate ? (
            <section aria-labelledby="release-about">
              <h2 id="release-about" className="display-3 text-ink">About {company}</h2>
              <Prose html={boilerplate} className="mt-3" />
            </section>
          ) : <div />}
          <ContactCard title="Media contact" {...contact} />
        </div>
      ) : null}
    </>
  );
}
