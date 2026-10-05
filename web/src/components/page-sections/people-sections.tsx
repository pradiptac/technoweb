import { Container } from "@/components/ui/container";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { TeamGrid } from "@/components/company/team-grid";
import { MapEmbed } from "@/components/contact/map-embed";
import { IconDownload } from "@/components/icons-ui";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type {
  ColumnsSectionData, CountdownSectionData, DownloadsSectionData, MapSectionData, TeamSectionData,
} from "@/types/api";
import { Countdown } from "./countdown";
import { SectionButtons, SectionFrame, SectionHead } from "./section-parts";

/**
 * The five sections of 0.111.0 (`docs/page-builder.md`): the team as a live
 * list, files to download, a countdown, columns of text and a map. Each
 * keeps the proportion rule of 0.107.0 — never more columns than items, a
 * read list held to a width it reads at.
 */

type Reveal = { reveal?: SectionRevealAttr | null };

/** The team cards the `/team` page draws, so every theme's idiom reaches them. */
export function TeamSection({ data, reveal }: { data: TeamSectionData } & Reveal) {
  if (!data.members?.length) return null;
  const titled = Boolean(data.heading);

  return (
    <SectionFrame type="team" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <TeamGrid members={data.members} groupByDepartment={Boolean(data.group)} headingLevel={titled ? 3 : 2} />
      </Container>
    </SectionFrame>
  );
}

/** `245760` as `240 KB`, `3407872` as `3.3 MB`. */
function size(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** One row per file, down one `max-w-3xl` column: its kind, its name, a line about it, its size, and the button. */
export function DownloadsSection({ data, reveal }: { data: DownloadsSectionData } & Reveal) {
  const items = data.items ?? [];
  if (!items.length) return null;
  const Title = data.heading ? "h3" : "p";

  return (
    <SectionFrame type="downloads" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        {/* One column whatever the count: a list of files is read down, and two
            columns of three left an orphan row. */}
        <ul className="mx-auto grid max-w-3xl gap-3">
          {items.map((item, i) => (
            <li key={i} data-card data-download className="flex min-w-0 items-center gap-4 rounded-lg border border-line-strong bg-card p-4">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded border border-brand-ink/30 font-mono text-12 font-semibold uppercase text-brand-ink">
                {item.extension ?? "file"}
              </span>
              <div className="min-w-0 flex-1">
                <Title className="text-15 font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{item.title}</Title>
                <p className="mt-0.5 text-13 text-muted">
                  {[item.note, size(item.size)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <a
                href={item.url}
                download
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line-strong px-4 text-13-5 font-semibold text-ink transition-colors duration-(--duration-base) hover:border-brand-ink hover:text-brand-ink"
              >
                <IconDownload className="size-4" />
                <span>Download<span className="sr-only"> {item.title}</span></span>
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </SectionFrame>
  );
}

/** The boxes count down after hydration; the end date is the API's words. */
export function CountdownSection({ data, reveal }: { data: CountdownSectionData } & Reveal) {
  if (!data.ends_at) return null;

  return (
    <SectionFrame type="countdown" reveal={reveal}>
      <Container className="text-center">
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} center />
        <Countdown endsAt={data.ends_at} endsLabel={data.ends_label} doneText={data.done_text} />
        <SectionButtons primary={data.primary} secondary={data.secondary} center />
      </Container>
    </SectionFrame>
  );
}

/** Two or three columns of editor text — never more columns than there are. */
export function ColumnsSection({ data, reveal }: { data: ColumnsSectionData } & Reveal) {
  const columns = data.columns ?? [];
  if (!columns.length) return null;
  const Title = data.heading ? "h3" : "h2";

  return (
    <SectionFrame type="columns" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <div className={cn("grid gap-10", columns.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
          {columns.map((c, i) => (
            <div key={i} className="min-w-0">
              {c.heading && <Title className="mb-3 text-20 font-semibold leading-snug text-ink">{c.heading}</Title>}
              <ProseWithShortcodes html={c.body} />
            </div>
          ))}
        </div>
      </Container>
    </SectionFrame>
  );
}

/** Google's map, pressed to load, held to `max-w-5xl` so it is never a wall at 1920. */
export function MapSection({ data, reveal }: { data: MapSectionData } & Reveal) {
  if (!data.url) return null;

  return (
    <SectionFrame type="map" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} lede={data.lede} center />
        <div className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-line-strong bg-card">
          <MapEmbed src={data.url} address={data.address} company={data.heading || "the location"} />
        </div>
      </Container>
    </SectionFrame>
  );
}
