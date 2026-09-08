import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { JsonLd, jsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/lib/settings";
import { bannerFor, type BannerSection } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

export type Crumb = { name: string; path: string };

/**
 * Breadcrumbs render visibly AND as BreadcrumbList structured data — Google
 * uses the markup for the SERP trail, so the two must never drift apart. One
 * component emitting both is the only way to guarantee that.
 */
export function Breadcrumbs({
  crumbs, onDark = false, onBanner = false,
}: {
  crumbs: Crumb[];
  onDark?: boolean;
  /**
   * Over a photograph rather than over a flat dark panel.
   *
   * `--color-dark-muted` is chosen to read on `--color-dark` and measures
   * **2.62:1** against the lightest ground a banner can produce, so on a
   * banner the trail is `dark-ink` throughout and the current page is told
   * apart by weight instead of by colour. See the note on `PageHero`.
   */
  onBanner?: boolean;
}) {
  const full = [{ name: "Home", path: "/" }, ...crumbs];

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]",
            onBanner ? "text-dark-ink" : onDark ? "text-dark-muted" : "text-muted",
          )}
        >
          {full.map((c, i) => {
            const last = i === full.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-2">
                {last ? (
                  <span
                    aria-current="page"
                    className={cn(onBanner ? "font-semibold" : onDark ? "text-dark-ink" : "text-ink")}
                  >
                    {c.name}
                  </span>
                ) : (
                  <>
                    <Link href={c.path} className="py-1 hover:underline">{c.name}</Link>
                    <span aria-hidden className="opacity-50">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={jsonLd.breadcrumbs(full)} />
    </>
  );
}

/**
 * The heading block every first- and second-level page opens with.
 *
 * ## The banner
 *
 * Naming a `section` puts that area's picture behind the words — the setting
 * chain is in `bannerFor`, and with nothing uploaded this renders exactly as
 * it did before banners existed. That is why the prop is on the hero rather
 * than a URL threaded through twenty page components: a page says which area
 * it belongs to, once, and never has to know whether a banner exists.
 *
 * It reads the settings itself, which is free — `getSiteSettings` is a tagged
 * fetch and Next dedupes it within a render, so a page that already fetched
 * them does not fetch again.
 *
 * ## Why text over a photograph is safe here, when this codebase refuses it
 * ## everywhere else
 *
 * `BlogHero` and `Gallery` both put their titles on a solid band, and both
 * carry the same note: a background nobody has seen yet cannot be made safe,
 * because white is legible over a dark image and invisible over a pale one.
 * The blog hero measured **1.14:1** doing it the obvious way.
 *
 * What makes this different is that the picture is *forced* dark rather than
 * hoped to be. `brightness(.35)` scales every channel, so the lightest pixel
 * any photograph can produce here is 35% of white — `#595959` — whatever was
 * uploaded. That is not a wash over an unknown ground, it is a ceiling on the
 * ground itself, and the pairings against it are arithmetic:
 *
 * | on `#595959` | |
 * |---|---|
 * | `dark-ink` | **6.51:1** |
 * | `brand-200` | **4.74:1** |
 * | `brand-300` | 3.60:1 |
 * | `dark-muted` | 2.62:1 |
 *
 * So the kicker is `brand-200` and not the `brand-300` the flat dark tone
 * uses, and the lede is `dark-ink` and not `dark-muted`. Both of those would
 * have looked perfectly fine over the dark photographs anybody actually
 * uploads and failed on the pale one somebody eventually will.
 *
 * The section keeps an opaque `bg-dark` underneath, so the ratio the audit
 * measures and the ratio a reader gets agree — a translucent scrim would let
 * the audit grade against the token while the reader got the photograph. The
 * gradient over the image is decoration only: every stop is translucent, so
 * it can darken the real composite and never lighten it.
 */
export async function PageHero({
  kicker, title, lede, crumbs, children, tone = "light", section,
}: {
  kicker?: string;
  title: string;
  lede?: string | null;
  crumbs?: Crumb[];
  children?: ReactNode;
  tone?: "light" | "dark";
  /** The area of the site this page belongs to, which decides its banner. */
  section?: BannerSection;
}) {
  const settings = section ? await getSiteSettings() : {};
  const banner = bannerFor(settings, section);
  const dark = tone === "dark" || Boolean(banner);

  return (
    <section
      className={cn(
        "page-hero relative overflow-hidden",
        dark ? "bg-dark text-dark-ink" : "bg-linear-to-b from-brand-50 to-transparent to-70%",
      )}
    >
      {banner ? (
        <>
          {/*
            A plain <img>, like every other API-served picture here — the
            optimiser would need this host in `remotePatterns`, which in
            production it is not. Eager and high priority: it is the largest
            thing above the fold and therefore the LCP element on every page
            that has one.

            `alt=""`: the banner is decoration behind a heading that already
            says what the page is. Describing it would make a screen reader
            read a stock photograph out before the title.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover brightness-[.35]"
            fetchPriority="high"
          />
          {/*
            A ramp from the text side into the picture. Every stop is
            translucent, deliberately: the guarantee above comes from the
            filter, and a translucent overlay can only make the real composite
            darker than the audit's reading of it. An opaque stop here would
            hide the photograph on the side the words are.
          */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-linear-to-r from-dark/80 via-dark/45 to-transparent"
          />
        </>
      ) : (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 [background-size:56px_56px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_20%,transparent_75%)]",
            dark
              ? "[background-image:linear-gradient(var(--color-dark-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-dark-line)_1px,transparent_1px)]"
              : "[background-image:linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)]",
          )}
        />
      )}

      {/*
        Taller with a banner than without. A heading block on a flat ground is
        as tall as its words; a banner is a picture, and at the reference's own
        proportions a 1440px-wide one is a little over 300px. The copy still
        decides the height — this is padding, not a ratio, so a long product
        name cannot be cropped.
      */}
      <Container
        className={cn(
          "relative",
          banner ? "pt-14 pb-12 lg:pt-24 lg:pb-20" : "pt-11 pb-9 lg:pt-16 lg:pb-10",
        )}
      >
        {crumbs && (
          <div className="mb-6">
            <Breadcrumbs crumbs={crumbs} onDark={dark} onBanner={Boolean(banner)} />
          </div>
        )}
        {kicker && (
          <span
            className={cn(
              "text-[11.5px] font-semibold uppercase tracking-[.13em]",
              banner ? "text-brand-200" : dark ? "text-brand-300" : "text-brand-ink",
            )}
          >
            {kicker}
          </span>
        )}
        {/*
          No width cap on the heading, and that reverses an earlier decision
          here deliberately.

          The cap was 20ch, on the argument that display type is set for shape
          rather than for reading — two or three short lines read as a title
          where one long ribbon does not. That holds for a headline somebody
          wrote to fit. It does not hold for a **name**, which is most of what
          this hero is given: a product is called "Lenovo ThinkPad E14 (i5,
          16GB, 512GB SSD)" whether or not that fits 20 characters, and capping
          it broke the line mid-parenthesis with half the row empty beside it.
          A name that wraps where nothing about the name says to wrap reads as
          a rendering fault rather than as typesetting.

          It still wraps when it genuinely runs out of room — the alternative,
          `whitespace-nowrap`, would put a long title straight through the right
          edge of a 320px screen and fail the zero-tolerance overflow check.
        */}
        {/*
          `text-balance` for when it does wrap. A heading that runs out of room
          breaks wherever the line happens to end, which routinely leaves one
          word alone on the second line — "modes." under a full first line reads
          as a mistake. Balance splits the lines evenly instead. It is a no-op
          on the single line most titles occupy, and browsers cap it at a few
          lines, which is all a heading ever has.
        */}
        <h1 className={cn("display-2 text-balance", kicker && "mt-3.5")}>{title}</h1>
        {lede && (
          <p className={cn("lede measure mt-4", banner ? "text-dark-ink" : dark && "text-dark-muted")}>
            {lede}
          </p>
        )}
        {children && <div className="mt-7">{children}</div>}
      </Container>
    </section>
  );
}
