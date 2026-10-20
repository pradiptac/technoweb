import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Prose } from "@/components/ui/prose";
import { ArrowLink } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { blurProps } from "@/lib/blur";
import { publicApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Archive } from "@/app/(marketing)/[slug]/archive";
import type { SiteSettings } from "@/lib/site-settings";
import type { ReleaseData } from "@/types/presets";
import { ArchiveShell } from "./archive-shell";
import { ContactCard, CoverageCard, ReleaseRow, dataOf, groupBy, yearOf, type PresetEntry } from "./preset-parts";

/**
 * The newsroom (docs/content-presets.md): the newest release as the lead, the
 * rest by year, the coverage others have written, and the media kit — the
 * boilerplate, the press contact and the files in the chosen downloads
 * category. The coverage strip asks for its own six and draws nothing when
 * that read fails, so the releases never depend on it.
 */
export async function NewsroomArchive({ archive, settings }: { archive: Archive; settings: SiteSettings }) {
  const { entries } = archive;
  const first = entries.meta.current_page === 1 ? entries.data[0] : undefined;
  const rest = first ? entries.data.slice(1) : entries.data;
  const kit = entries.meta.newsroom_kit ?? [];

  const coverageType = await publicApi.contentTypes().then((r) => r.data.find((t) => t.preset === "newsroom_coverage")).catch(() => undefined);
  const coverage = coverageType
    ? await publicApi.contentArchive(coverageType.slug, "?per_page=6").then((r) => r.data).catch(() => [])
    : [];

  const boilerplate = settings.newsroom_boilerplate;
  const contact = { name: settings.newsroom_contact_name, email: settings.newsroom_contact_email, phone: settings.newsroom_contact_phone };

  return (
    <ArchiveShell archive={archive} after={(
      <>
        {coverage.length > 0 && coverageType ? (
          <section aria-labelledby="newsroom-coverage" className="mt-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <h2 id="newsroom-coverage" className="display-3 text-ink">{coverageType.plural}</h2>
              <ArrowLink href={coverageType.path}>All coverage</ArrowLink>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {coverage.map((c) => <CoverageCard key={c.id} entry={c as PresetEntry} />)}
            </ul>
          </section>
        ) : null}

        {boilerplate || kit.length > 0 || contact.name || contact.email || contact.phone ? (
          <section aria-labelledby="newsroom-kit" className={cn("mt-16 grid gap-6", (contact.name || contact.email || contact.phone) && "lg:grid-cols-[7fr_5fr]")}>
            <Card interactive={false} padding="lg">
              <h2 id="newsroom-kit" className="display-3 text-ink">Media kit</h2>
              {boilerplate ? <Prose html={boilerplate} className="mt-4" /> : null}
              {kit.length > 0 ? (
                <ul className="mt-6 divide-y divide-line border-t border-line">
                  {kit.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                      <span className="min-w-0 text-15 font-semibold text-ink">{d.title}</span>
                      {/* A route handler, so a plain link: `next/link` would prefetch it and count a download. */}
                      <a href={`/api/downloads/${d.id}`} className="inline-flex min-h-[44px] shrink-0 items-center text-14 font-semibold text-brand-ink underline-offset-2 hover:underline">
                        Download<span className="sr-only"> {d.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
            <ContactCard title="Press contact" {...contact} />
          </section>
        ) : null}
      </>
    )}>
      {first ? <Lead entry={first as PresetEntry} /> : null}

      {rest.length > 0 ? (
        <div className={first ? "mt-12" : undefined}>
          {groupBy(rest as PresetEntry[], (e) => yearOf(e.published_at)).map((g) => (
            <section key={g.key} aria-labelledby={`releases-${g.key}`} className="mt-10 first:mt-0 grid gap-4 lg:grid-cols-[10rem_1fr]">
              <h2 id={`releases-${g.key}`} className="text-17 font-semibold text-muted">{g.key}</h2>
              <ul>{g.rows.map((e) => <ReleaseRow key={e.id} entry={e} />)}</ul>
            </section>
          ))}
        </div>
      ) : null}
    </ArchiveShell>
  );
}

function Lead({ entry }: { entry: PresetEntry }) {
  const d = dataOf<ReleaseData>(entry);
  return (
    // Without a picture the lead is words alone: an empty well beside them reads as a picture that failed.
    <Card href={entry.path} padding="none" className={entry.image ? "grid overflow-hidden lg:grid-cols-[7fr_5fr]" : "overflow-hidden"}>
      {entry.image ? (
        <div data-preset-item="" className="relative min-h-56 lg:min-h-80">
          <Image {...blurProps(entry.image_blur)} src={entry.image} alt={entry.image_alt ?? ""} fill priority
            sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover"
            style={entry.image_focus ? { objectPosition: entry.image_focus } : undefined} />
        </div>
      ) : null}
      <div className={entry.image ? "flex flex-col justify-center p-6 lg:p-10" : "max-w-3xl p-6 lg:p-10"}>
        <p className="text-13 text-muted">
          <time dateTime={entry.published_at ?? undefined}>{formatDate(entry.published_at, "long")}</time>
          {d.dateline ? <span>, {d.dateline}</span> : null}
        </p>
        <h2 className="display-3 mt-2 text-ink">{entry.title}</h2>
        {entry.summary ? <p className="mt-3 text-15 text-ink-2">{entry.summary}</p> : null}
        <span className="mt-5 text-14 font-semibold text-brand-ink">Read the release</span>
      </div>
    </Card>
  );
}

