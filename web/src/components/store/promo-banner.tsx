import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { settingEnabled, type SiteSettings } from "@/lib/site-settings";

/**
 * The store homepage's promotional band — one settings-driven static slot,
 * not a second `Slider`. It is a single fixed block rather than a rotating
 * carousel, so a handful of settings fields are less for an editor to click
 * through than the sliders CRUD for one slide.
 *
 * `bg-dark`, not `bg-brand-900` — a different, near-black weight from
 * `CtaBand`'s brand-green band, so the two read as distinct rather than as
 * one component reused twice.
 */
export function PromoBanner({ settings }: { settings: SiteSettings }) {
  if (!settingEnabled(settings, "store_promo_enabled", false)) return null;

  const kicker = settings.store_promo_kicker;
  const heading = settings.store_promo_heading;
  const priceText = settings.store_promo_price_text;
  const subheading = settings.store_promo_subheading;
  const ctaLabel = settings.store_promo_cta_label || "Shop Now";
  const ctaHref = settings.store_promo_cta_href || "/store";
  const image = settings.store_promo_image_url;

  // Nothing configured beyond the toggle — nothing to show.
  if (!heading && !priceText && !subheading && !image) return null;

  return (
    /*
      Barely any padding of its own, because this band is an insert between two
      product grids rather than a section, and the space around it is the
      grids' to give. `py-8 lg:py-10` was already tighter than `section-y` and
      was still the wrong model: padding stacks, so 40px here on top of the
      grid's own 80 measured as a **120px** gap above the band and 104 below —
      the page reading as three unrelated pages rather than one shop.
      `/store` trims the two facing edges to match; 8px here keeps the band from
      touching either grid if it is ever dropped somewhere that gives it
      nothing.
    */
    <section data-aos="fade-up" className="py-2">
      <Container>
        {/*
          A wide, short strip — about 3.9:1 on a large screen, which is the
          proportion this kind of promotional band is drawn at. It used to be a
          two-column grid with its own vertical padding, so the band grew to
          whatever the copy needed and came out nearly square: a poster in the
          middle of the page rather than a banner across it.

          The ratio is only applied from `lg`. Below that the copy stacks under
          the picture and a fixed ratio would either crop the words or leave a
          field of empty dark under them.
        */}
        <div className="relative overflow-hidden rounded-xl bg-dark text-dark-ink lg:aspect-[3.9/1]">
          {image && (
            /*
              Bleeding off the right edge rather than contained with padding
              beside the copy — the picture is part of the band, not an
              illustration sitting in half of it. `object-cover` for the same
              reason: at this ratio a contained image is a small object adrift
              in a wide dark field.
            */
            <div className="relative h-44 w-full sm:h-56 lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[46%]">
              <Image
                src={image}
                alt=""
                fill
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="object-cover"
                unoptimized
              />
              {/*
                A fade into the band so the photograph does not stop at a hard
                vertical line. `from-dark` — an opaque stop, never a
                translucent wash: `gradientStops()` discards a stop that fails
                its own opacity check, and the text beside it would then be
                graded against whatever opaque colour is further up the tree.
              */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 hidden w-28 bg-linear-to-r from-dark to-transparent lg:block"
              />
            </div>
          )}

          <div className="relative px-6 py-8 sm:px-10 sm:py-10 lg:absolute lg:inset-y-0 lg:left-0 lg:flex lg:w-[60%] lg:flex-col lg:justify-center lg:py-0">
            {kicker && (
              <span className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-brand-300">
                {kicker}
              </span>
            )}
            {priceText && <p className="mt-1.5 text-[15px] font-medium text-dark-muted">{priceText}</p>}
            {heading && <h2 className="display-2 mt-1.5 text-dark-ink">{heading}</h2>}
            {subheading && (
              <p className="mt-3 max-w-[46ch] text-[14.5px] leading-[1.6] text-dark-muted">{subheading}</p>
            )}

            <div className="mt-5">
              <ButtonLink href={ctaHref} variant="onDark">
                {ctaLabel} <IconArrowRight />
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
