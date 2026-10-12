import Image from "next/image";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { Container } from "@/components/ui/container";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { sectionReveal } from "@/lib/motion-choices";
import { cn } from "@/lib/utils";
import type { HeroSectionData } from "@/types/api";
import { HeroVideo } from "./hero-video";
import { getSiteSettings } from "@/lib/settings";
import { kineticFor } from "@/lib/kinetic";
import { KineticText } from "@/components/ui/kinetic-text";
import { SectionButtons } from "./section-parts";

/**
 * A builder page's opening band — three layouts, one set of words.
 *
 * **First on the page it is the page's heading**: an `h1`, with the
 * breadcrumb trail above it (visible and as `BreadcrumbList`, the one
 * `Breadcrumbs` always emits) — the route draws no `PageHero` then, so the
 * page still has exactly one `h1` and one trail. Anywhere else it is an
 * `h2` and carries no trail.
 *
 * - `centered` — the words centred on the section's own ground.
 * - `split` — the words beside the picture, framed; the picture is a
 *   `next/image` `fill` with `sizes` for its column, never the full width.
 * - `cover` — the picture fills the band under `bg-dark` at reduced
 *   opacity, the `PageHero` banner's rule: the words are graded against
 *   the dark ground and the real composite can only be darker, so the
 *   contrast is arithmetic rather than a hope about the photograph. A cover
 *   may also carry a background `video` (0.115.0): `HeroVideo`, a client
 *   island over the picture at the same 35%. The picture stays the first
 *   paint and the largest one; the video fades in only once it plays, and
 *   never plays for reduced motion or Save-Data.
 *
 * The picture is eager on the first two sections, where it is the largest
 * paint, and lazy below — `SectionBg`'s rule.
 */
export async function HeroSection({ data, first, crumbs, eager, revealId, sectionId }: {
  data: HeroSectionData;
  first: boolean;
  crumbs: Crumb[];
  eager: boolean;
  /** The section's stored `reveal`, resolved here because the default depends on the layout. */
  revealId?: string | null;
  /** The section's id: the heading's `sr-only` copy is named after it, so two heroes never share one. */
  sectionId: string;
}) {
  const Heading = first ? "h1" : "h2";
  // The heading's effect (0.171.0, docs/motion.md "Kinetic headings"): the
  // section's own, or Motion → Hero heading when it follows the site.
  const settings = await getSiteSettings();
  const kinetic = kineticFor(settings.motion_headline, data.kinetic, data.kinetic_words);
  const titleId = `k-${sectionId}`;
  const title = kinetic.effect === "none"
    ? data.heading
    : <KineticText text={data.heading} effect={kinetic.effect} words={kinetic.words} id={titleId} />;
  const labelled = kinetic.effect === "rotate" ? titleId : undefined;
  const layout = data.layout ?? "centered";
  const picture = data.image
    ? (sizes: string, className?: string) => (
        <Image
          src={data.image!}
          alt={layout === "cover" ? "" : data.image_alt ?? ""}
          fill
          sizes={sizes}
          loading={eager ? "eager" : undefined}
          className={cn("object-cover", className)}
          style={focalStyle(data.image_focus)} {...blurProps(data.image_blur)}
        />
      )
    : null;

  // An opening hero is the page's first paint and never animates, whatever
  // was chosen. Otherwise a cover hero is still by default and the other two
  // rise — what each did before the choice existed.
  const reveal = first ? null : sectionReveal(revealId, layout === "cover" && picture ? null : "fade-up");

  // No trail on the homepage (0.113.0, a builder page chosen as `/`): it is
  // passed no crumbs, and a trail of "Home" alone, on Home, says nothing.
  const trail = first && crumbs.length > 0;

  if (layout === "cover" && picture) {
    return (
      <section data-page-section="hero" data-hero-layout="cover" data-frame data-aos={reveal ?? undefined} className="relative overflow-hidden bg-dark">
        {picture("100vw", "opacity-35")}
        {data.video && <HeroVideo src={data.video} focus={data.image_focus} />}
        <Container className="relative py-20 lg:py-28">
          {trail && <div className="mb-8"><Breadcrumbs crumbs={crumbs} onBanner /></div>}
          <div className="max-w-3xl">
            {data.kicker && <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-dark-muted-brand">{data.kicker}</span>}
            <Heading className={cn("display-1 text-balance text-dark-ink", data.kicker && "mt-4")} aria-labelledby={labelled}>{title}</Heading>
            {data.lede && <p className="lede mt-5 text-dark-ink">{data.lede}</p>}
            <SectionButtons primary={data.primary} secondary={data.secondary} onDark />
          </div>
        </Container>
      </section>
    );
  }

  const words = (center: boolean) => (
    <>
      {data.kicker && <span className="text-11-5 font-semibold uppercase tracking-[.13em] text-secondary-ink">{data.kicker}</span>}
      <Heading className={cn("display-1 text-balance", data.kicker && "mt-4")} aria-labelledby={labelled}>{title}</Heading>
      {data.lede && <p className={cn("lede mt-5", center && "mx-auto max-w-3xl")}>{data.lede}</p>}
      <SectionButtons primary={data.primary} secondary={data.secondary} center={center} />
    </>
  );

  if (layout === "split" && picture) {
    return (
      <section data-page-section="hero" data-hero-layout="split" data-aos={reveal ?? undefined} className="section-y-lg">
        <Container>
          {trail && <div className="mb-8"><Breadcrumbs crumbs={crumbs} /></div>}
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">{words(false)}</div>
            <div data-frame className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line-strong bg-surface-2">
              {picture("(min-width: 1024px) 45vw, 90vw")}
            </div>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section data-page-section="hero" data-hero-layout="centered" data-aos={reveal ?? undefined} className="section-y-lg">
      <Container className="text-center">
        {trail && <div className="mb-8 flex justify-center"><Breadcrumbs crumbs={crumbs} /></div>}
        {words(true)}
      </Container>
    </section>
  );
}
