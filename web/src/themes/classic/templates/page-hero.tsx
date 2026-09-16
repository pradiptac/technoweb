import Image from "next/image";
import { Backdrop } from "@/components/ui/backdrop";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { motionFor } from "@/lib/motion-choices";
import { bannerFor } from "@/lib/site-settings";
import { cn } from "@/lib/utils";
import type { PageHeroProps } from "@/themes/contract";

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
 * The settings are read once by the dispatcher (`components/ui/page-hero.tsx`),
 * which is free — `getSiteSettings` is a tagged fetch and Next dedupes it
 * within a render, so a page that already fetched them does not fetch again.
 *
 * Classic's template, moved here verbatim from `components/ui/page-hero.tsx`
 * on 2026-09-16; the dispatcher there resolves the active theme and hands
 * this the props.
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
export function PageHero({
  kicker, title, lede, crumbs, children, tone = "light", section, settings,
}: PageHeroProps) {
  // The settings arrive from the dispatcher in `components/ui/page-hero.tsx`,
  // which reads them once per request; the backdrop style is a setting too.
  const banner = section ? bannerFor(settings, section) : null;
  const backdrop = motionFor(settings).hero;
  const dark = tone === "dark" || Boolean(banner);

  return (
    <section
      className={cn(
        "page-hero relative overflow-hidden",
        /*
          A banner is 300px, and it is a **minimum** rather than a height.

          A picture wants a size of its own — the words in front of it are two
          lines and the band around them is the design — so the padding that
          sizes a plain heading block is the wrong instrument here, and it gave
          357px on one page and 387px on the next depending on how long the
          lede ran.

          `min-h` rather than `h`, because this hero is handed names rather than
          copy written to fit: a product is called "Lenovo ThinkPad E14 (i5,
          16GB, 512GB SSD)" whether or not it suits 300px, and a store page adds
          a button under the lede. A fixed height would crop whichever of those
          overflowed — the same reasoning that took the width cap off the
          heading. It is exactly 300 in every ordinary case and taller only when
          the content genuinely needs it.
        */
        /*
          `grid`, not `flex`, and the difference is load-bearing.

          A flex item is sized to its content, so the Container shrank to the
          width of its longest line — and `w-full` to stop that is the same
          Tailwind property group as the Container's own `w-[90%]`, so
          tailwind-merge let it win and the hero went full-bleed. Every other
          section on the site keeps a 5% margin and this one did not: the
          breadcrumbs and the heading sat hard against the left edge of the
          screen.

          A grid item stretches across its column by default — `justify-items`
          is `stretch` and only `align-items` is being set here — so the
          Container keeps its own width and needs nothing said about it.
        */
        banner && "grid min-h-[300px] items-center",
        dark ? "bg-dark text-dark-ink" : "bg-linear-to-b from-brand-50 to-transparent to-70%",
      )}
    >
      {banner ? (
        <>
          {/*
            next/image with `priority`: it is the largest thing above the fold
            and therefore the LCP element on every page that has one, and the
            optimiser serves it resized to the viewport as AVIF/WebP instead
            of the 2560px original — a 1.2MB JPEG was measured as the LCP
            element on the homepage. `images.remotePatterns` is derived from
            the asset origins in `next.config.ts`; the old note here about it
            naming only the development host was stale.

            **A client component, and that matters beyond the bytes.** React
            Flight emits a preload hint for every non-lazy raw `<img>` in a
            *server* component, and a `<Link>` prefetch of a static route
            executes those hints — so with a plain `<img>` here, every page
            that linked to /support and /resources in its nav downloaded
            those pages' banners too, ~1MB, and Chrome logged "preloaded but
            not used" on every route. `next/image` is a client component: its
            preload runs during this page's own render and never rides in
            another page's prefetch payload.

            `alt=""`: the banner is decoration behind a heading that already
            says what the page is. Describing it would make a screen reader
            read a stock photograph out before the title.
          */}
          <Image
            src={banner}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            priority
            className="object-cover brightness-[.35]"
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
        <Backdrop
          variant={backdrop}
          tone={dark ? "dark" : "light"}
          size={56}
          mask="radial-gradient(ellipse 80% 60% at 50% 0%, #000 20%, transparent 75%)"
        />
      )}

      {/*
        No width utility here: the Container's own `w-[90%]` is the site's
        margin and anything in this slot from the same property group would
        replace it rather than add to it.

        The padding stays for the case the content outgrows 300px, which is
        what keeps the band off the words rather than the min-height doing it.
      */}
      <Container className={cn("relative", banner ? "py-10" : "pt-11 pb-9 lg:pt-16 lg:pb-10")}>
        {crumbs && (
          <div className="mb-6">
            <Breadcrumbs crumbs={crumbs} onDark={dark} onBanner={Boolean(banner)} />
          </div>
        )}
        {kicker && (
          <span
            className={cn(
              "text-11-5 font-semibold uppercase tracking-[.13em]",
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
