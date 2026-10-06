import Image from "next/image";
import { ArrowLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconTile } from "@/components/ui/icon-tile";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { YouTubeEmbed } from "@/components/blog/youtube-embed";
import { focalStyle } from "@/lib/focal";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type {
  DividerSectionData, FeaturesSectionData, MediaTextSectionData, RichTextSectionData,
  TestimonialSectionData, VideoSectionData,
} from "@/types/api";
import { HeadlineWords, SectionButtons, SectionFrame, SectionHead } from "./section-parts";

/**
 * The self-contained section types — everything whose words and pictures
 * live in the section itself. The embedded ones (a block, a slider, a
 * gallery, a form, a live list, a logo strip) are `embed-sections.tsx`.
 */

/** Editor text, shortcodes expanded as components (never by string substitution — see `lib/shortcodes.ts`). */
export function RichTextSection({ data, reveal }: { data: RichTextSectionData; reveal?: SectionRevealAttr | null }) {
  return (
    <SectionFrame type="rich_text" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} />
        <ProseWithShortcodes html={data.body} />
      </Container>
    </SectionFrame>
  );
}

/**
 * A picture or a video beside the words. The video is YouTube's
 * click-to-play facade (nothing leaves the browser until it is pressed, and
 * the poster is drawn here, never fetched from `i.ytimg.com`) or a file from
 * the library with its own controls.
 */
export function MediaTextSection({ data, eager, reveal }: { data: MediaTextSectionData; eager: boolean; reveal?: SectionRevealAttr | null }) {
  const media = data.media === "youtube" && data.youtube
    ? <YouTubeEmbed url={data.youtube} title={data.heading} />
    : data.media === "mp4" && data.video
      ? <video src={data.video} controls preload="metadata" playsInline className="aspect-video w-full rounded-lg bg-dark" aria-label={data.heading} />
      : data.image
        ? (
            <div data-frame className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line-strong bg-surface-2">
              <Image
                src={data.image}
                alt={data.image_alt ?? ""}
                fill
                sizes="(min-width: 1024px) 45vw, 90vw"
                loading={eager ? "eager" : undefined}
                className="object-cover"
                style={focalStyle(data.image_focus)}
              />
            </div>
          )
        : null;

  return (
    <SectionFrame type="media_text" reveal={reveal}>
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className={cn("min-w-0", data.side === "left" && "lg:order-2")}>
            {data.kicker && <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-secondary-ink">{data.kicker}</span>}
            <h2 data-section-heading className={cn("display-2 text-balance", data.kicker && "mt-3.5")}><HeadlineWords text={data.heading} /></h2>
            {data.body && <ProseWithShortcodes html={data.body} className="mt-5" />}
            <SectionButtons primary={data.primary} secondary={data.secondary} />
          </div>
          <div className={cn("min-w-0", data.side === "left" && "lg:order-1")}>{media}</div>
        </div>
      </Container>
    </SectionFrame>
  );
}

const COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

/** Short points in columns: an icon, a title (`h3`, under the section's `h2`), a line, an optional link. */
export function FeaturesSection({ data, reveal }: { data: FeaturesSectionData; reveal?: SectionRevealAttr | null }) {
  const cols = COLS[data.columns ?? 3] ?? COLS[3];

  return (
    <SectionFrame type="features" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <ul className={cn("grid gap-4", cols)}>
          {data.items.map((item, i) => (
            <li key={i} data-card className="flex min-w-0 flex-col rounded-lg border border-line-strong bg-card p-6">
              {item.icon && <IconTile name={item.icon} className="mb-4" />}
              {data.heading
                ? <h3 className="text-16-5 font-semibold leading-snug text-ink">{item.title}</h3>
                : <p className="text-16-5 font-semibold leading-snug text-ink">{item.title}</p>}
              {item.body && <p className="mt-2 text-14-5 leading-[1.58] text-muted">{item.body}</p>}
              {item.href && (
                <ArrowLink href={item.href} className="mt-auto pt-4">{item.link_label || "Learn more"}</ArrowLink>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </SectionFrame>
  );
}

/** One quotation, as a `figure` so the attribution belongs to it. */
export function TestimonialSection({ data, reveal }: { data: TestimonialSectionData; reveal?: SectionRevealAttr | null }) {
  return (
    <SectionFrame type="testimonial" reveal={reveal}>
      <Container>
        <figure data-card className="mx-auto max-w-4xl rounded-xl border border-line-strong bg-card p-8 lg:p-12">
          <svg viewBox="0 0 24 24" className="size-8 fill-brand-ink" aria-hidden>
            <path d="M9.5 6C6.5 7.2 5 9.6 5 13v5h5v-5H7.6c.2-2 1.1-3.3 2.9-4.1L9.5 6zm9 0c-3 1.2-4.5 3.6-4.5 7v5h5v-5h-2.4c.2-2 1.1-3.3 2.9-4.1L18.5 6z" />
          </svg>
          <blockquote className="mt-4 text-[clamp(18px,2vw,22px)] leading-[1.5] text-ink">
            <p>{data.quote}</p>
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-4">
            {data.photo && (
              <span className="relative size-14 shrink-0 overflow-hidden rounded-full bg-surface-2">
                <Image src={data.photo} alt={data.photo_alt ?? ""} fill sizes="56px" className="object-cover" style={focalStyle(data.photo_focus)} />
              </span>
            )}
            <span>
              <span className="block text-15 font-semibold text-ink">{data.name}</span>
              {data.role && <span className="block text-13-5 text-muted">{data.role}</span>}
            </span>
          </figcaption>
        </figure>
      </Container>
    </SectionFrame>
  );
}

/** A video on its own: the YouTube facade, or a library file with controls. */
export function VideoSection({ data, reveal }: { data: VideoSectionData; reveal?: SectionRevealAttr | null }) {
  const title = data.heading || data.caption || "Video";

  return (
    <SectionFrame type="video" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} />
        <figure className="mx-auto max-w-5xl">
          {data.source === "youtube" && data.youtube
            ? <YouTubeEmbed url={data.youtube} title={title} />
            : data.video
              ? <video src={data.video} controls preload="metadata" playsInline className="aspect-video w-full rounded-lg bg-dark" aria-label={title} />
              : null}
          {data.caption && <figcaption className="mt-3 text-13-5 text-muted">{data.caption}</figcaption>}
        </figure>
      </Container>
    </SectionFrame>
  );
}

const SPACE = { small: "py-4", medium: "py-10", large: "py-20" } as const;

/** Space between two sections, with or without a rule. Decoration only, so the rule is `aria-hidden`. */
export function DividerSection({ data, reveal }: { data: DividerSectionData; reveal?: SectionRevealAttr | null }) {
  return (
    <div data-page-section="divider" data-aos={reveal ?? undefined} className={SPACE[data.size ?? "medium"] ?? SPACE.medium}>
      {data.rule && <Container><hr aria-hidden className="border-line" /></Container>}
    </div>
  );
}
