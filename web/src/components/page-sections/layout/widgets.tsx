import Image from "next/image";
import Link from "next/link";
import { IconCheck } from "@/components/icons-ui";
import { ProductVideoPlayer } from "@/components/product/product-video";
import { ArrowLink, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuestionAccordion } from "@/components/ui/faq";
import { IconTile } from "@/components/ui/icon-tile";
import { ProseWithShortcodes } from "@/components/ui/prose-with-shortcodes";
import { blurProps } from "@/lib/blur";
import { focalStyle } from "@/lib/focal";
import { cn } from "@/lib/utils";
import type { LayoutAlign, LayoutWidget } from "@/types/api";
import { EmbedWidget } from "./embed-widgets";

/**
 * What a widget cannot know about itself, worked out by `LayoutSection` once
 * for the whole section (see there): the heading level it takes, whether an
 * icon box's title may be a heading yet, whether its picture is the one that
 * loads eagerly, and how many columns share its row.
 */
export type WidgetPlan = { level: 2 | 3; titleIsHeading: boolean; eager: boolean; columns: number };

const FALLBACK_PLAN: WidgetPlan = { level: 3, titleIsHeading: false, eager: false, columns: 1 };

/*
 * Every class below is a literal, in a table keyed by what the API stores
 * (never "text-" + size): Tailwind compiles only the names it can read, and a
 * built one silently renders as nothing. `[overflow-wrap:anywhere]` on every
 * run of editor words so one unbroken string cannot push a 320px screen wider.
 */
const WRAP = "[overflow-wrap:anywhere]";

const HEADING_SIZE = {
  s: "text-[clamp(17px,1.4vw+10px,20px)] font-semibold leading-snug tracking-[-.01em]",
  m: "display-3",
  l: "display-2",
  xl: "display-1",
} as const;

const ALIGN = { inherit: "", start: "text-start", center: "text-center", end: "text-end" } as const;
const JUSTIFY = { inherit: "", start: "justify-start", center: "justify-center", end: "justify-end" } as const;
const RATIO = { "1:1": "aspect-square", "4:3": "aspect-[4/3]", "3:2": "aspect-[3/2]", "16:9": "aspect-video", "3:4": "aspect-[3/4]" } as const;
const ROUNDED = { none: "", s: "rounded-md", m: "rounded-xl", l: "rounded-3xl", full: "rounded-full" } as const;
// A tall video is held to a phone-sized column however wide its own is.
const VIDEO_RATIO = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "9:16": "mx-auto aspect-[9/16] max-w-[22rem]" } as const;
const SPACER = { s: "h-2", m: "h-6", l: "h-12", xl: "h-20" } as const;

/** The classes the section Style's "Show on" uses: the class, never the attribute (preflight's `[hidden]` is `!important`). */
function hide(showOn: LayoutWidget["show_on"]): string | undefined {
  if (!showOn) return undefined;
  return cn(!showOn.includes("phone") && "max-sm:hidden", !showOn.includes("tablet") && "sm:max-lg:hidden", !showOn.includes("desktop") && "lg:hidden") || undefined;
}

export function Widget({ widget, plan = FALLBACK_PLAN, columnAlign = "inherit" }: { widget: LayoutWidget; plan?: WidgetPlan; columnAlign?: LayoutAlign }) {
  const gone = hide(widget.show_on);

  switch (widget.type) {
    case "heading": {
      const Tag = plan.level === 2 ? "h2" : "h3";
      return (
        <Tag
          data-widget="heading"
          data-widget-heading
          className={cn("min-w-0 text-balance", WRAP, HEADING_SIZE[widget.size ?? "m"] ?? HEADING_SIZE.m, ALIGN[widget.align ?? "inherit"], gone)}
        >
          {widget.text}
        </Tag>
      );
    }

    case "text":
      return (
        <div data-widget="text" className={cn("min-w-0 max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto", gone)}>
          <ProseWithShortcodes
            html={widget.html}
            className={cn(WRAP, "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", widget.lead && "text-[19px] leading-[1.6]")}
          />
        </div>
      );

    case "button": {
      // Its own alignment, else the column's: both explicit. Left to the
      // section only when neither says — the section's rule is unlayered and
      // would win over a utility class on this element.
      const own = widget.align && widget.align !== "inherit" ? widget.align : columnAlign;
      const wrap = cn("flex min-w-0 flex-wrap", JUSTIFY[own], gone);
      const label = <span className={cn("min-w-0 text-center", WRAP)}>{widget.label}</span>;

      return (
        <div data-widget="button" data-section-buttons={own === "inherit" ? "" : undefined} className={wrap}>
          {widget.variant === "link"
            ? <ArrowLink href={widget.href} className="max-w-full">{label}</ArrowLink>
            : (
                <ButtonLink href={widget.href} variant={widget.variant === "secondary" ? "secondary" : "primary"} size="lg" className="max-w-full whitespace-normal">
                  {label}
                </ButtonLink>
              )}
        </div>
      );
    }

    case "image": {
      const picture = (
        <div data-frame className={cn("relative w-full overflow-hidden border border-line-strong bg-surface-2", RATIO[widget.ratio ?? "4:3"] ?? RATIO["4:3"], ROUNDED[widget.rounded ?? "none"] ?? "")}>
          <Image
            src={widget.image}
            alt={widget.image_alt ?? ""}
            fill
            // One column is the container; more share it, a phone is one column.
            sizes={`(min-width: 1024px) ${Math.max(15, Math.round(90 / Math.max(1, plan.columns)))}vw, 90vw`}
            loading={plan.eager ? "eager" : undefined}
            className="object-cover"
            style={focalStyle(widget.image_focus)}
            {...blurProps(widget.image_blur)}
          />
        </div>
      );
      const linked = widget.href
        ? <Link href={widget.href} aria-label={widget.image_alt ? undefined : (widget.caption || "Read more")} className="block">{picture}</Link>
        : picture;

      return (
        <figure data-widget="image" className={cn("m-0 min-w-0", gone)}>
          {linked}
          {widget.caption && <figcaption className={cn("mt-2 text-13-5 leading-snug text-muted", WRAP)}>{widget.caption}</figcaption>}
        </figure>
      );
    }

    case "video": {
      // The site's click-to-play facade and file player (the shop's and the
      // builder's video section's): nothing is requested from YouTube, and no
      // `i.ytimg.com` thumbnail, until a press; a file is `preload="none"`
      // with its cover. A source that no longer parses renders nothing.
      const mp4 = widget.source === "mp4";
      if (mp4 ? !widget.video : !widget.youtube) return null;

      return (
        <figure data-widget="video" className={cn("m-0 min-w-0", gone)}>
          <div data-frame className={cn("relative w-full overflow-hidden rounded-lg bg-dark", VIDEO_RATIO[widget.ratio ?? "16:9"] ?? VIDEO_RATIO["16:9"])}>
            <ProductVideoPlayer
              name={widget.caption || "Video"}
              video={mp4
                ? { kind: "file", url: widget.video, poster_url: widget.poster, poster_alt: widget.poster_alt }
                : { kind: "youtube", youtube_id: widget.youtube, poster_url: widget.poster, poster_alt: widget.poster_alt }}
            />
          </div>
          {widget.caption && <figcaption className={cn("mt-2 text-13-5 leading-snug text-muted", WRAP)}>{widget.caption}</figcaption>}
        </figure>
      );
    }

    case "form":
    case "slider":
    case "gallery":
      return <EmbedWidget widget={widget} plan={plan} hidden={gone} />;

    case "spacer":
      return <div data-widget="spacer" aria-hidden className={cn("shrink-0", SPACER[widget.size ?? "m"] ?? SPACER.m, gone)} />;

    case "divider":
      return <hr data-widget="divider" className={cn("m-0 border-0 border-t border-line-strong", widget.short ? "w-16" : "w-full", gone)} />;

    case "icon_box": {
      const Title = plan.titleIsHeading ? "h3" : "p";
      const inline = widget.layout === "inline";

      return (
        <Card interactive={false} padding="md" className={cn("h-full min-w-0", gone)}>
          <div data-widget="icon_box" className={cn("flex min-w-0 gap-4", inline ? "flex-row items-start" : "flex-col")}>
            {widget.icon && <IconTile name={widget.icon} className="shrink-0" />}
            <div className="min-w-0">
              <Title className={cn("text-16-5 font-semibold leading-snug text-ink", WRAP)}>{widget.title}</Title>
              {widget.body && <p className={cn("mt-2 text-14-5 leading-[1.58] text-muted", WRAP)}>{widget.body}</p>}
              {widget.href && <ArrowLink href={widget.href} className="mt-3">{widget.link_label || "Learn more"}</ArrowLink>}
            </div>
          </div>
        </Card>
      );
    }

    case "accordion":
      return (
        <div data-widget="accordion" className={cn("min-w-0", WRAP, gone)}>
          <QuestionAccordion items={widget.items.map((q, i) => ({ key: i, question: q.question, answer: q.answer }))} />
        </div>
      );

    case "list": {
      const text = (t: string) => <span className={cn("min-w-0 text-15-5 leading-[1.55] text-ink-2", WRAP)}>{t}</span>;

      if (widget.marker === "number") {
        return (
          <ol data-widget="list" className={cn("min-w-0 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-brand-ink", gone)}>
            {widget.items.map((item, i) => <li key={i} className="pl-1">{text(item.text)}</li>)}
          </ol>
        );
      }
      if (widget.marker === "dot") {
        return (
          <ul data-widget="list" className={cn("min-w-0 list-disc space-y-2 pl-6 marker:text-brand-ink", gone)}>
            {widget.items.map((item, i) => <li key={i} className="pl-1">{text(item.text)}</li>)}
          </ul>
        );
      }

      return (
        <ul data-widget="list" className={cn("min-w-0 space-y-3", gone)}>
          {widget.items.map((item, i) => (
            <li key={i} className="flex min-w-0 items-start gap-3.5">
              {item.icon
                ? <IconTile name={item.icon} size="sm" className="shrink-0" />
                : (
                    <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-brand-ink/30 text-brand-ink">
                      <IconCheck className="size-4" />
                    </span>
                  )}
              <span className="pt-0.5">{text(item.text)}</span>
            </li>
          ))}
        </ul>
      );
    }

    default:
      return null;
  }
}
