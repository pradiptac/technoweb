import Image from "next/image";
import { BlockView } from "@/components/blocks/block-view";
import { LogoMarquee, type StripMode } from "@/components/company/logo-marquee";
import { FormBlock } from "@/components/forms/form-block";
import { ArrowLink } from "@/components/ui/button";
import { Collection, Tile } from "@/components/ui/collection";
import { Container } from "@/components/ui/container";
import { QuestionAccordion } from "@/components/ui/faq";
import { Gallery } from "@/components/ui/gallery";
import { IconTile, hueForIcon } from "@/components/ui/icon-tile";
import { SliderFor } from "@/components/ui/slider-for";
import { publicApi } from "@/lib/api";
import type { SectionRevealAttr } from "@/lib/motion-choices";
import { VideoShelfTiles } from "@/components/store/video-shelf-tiles";
import { getSiteSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/site-settings";
import { videoShelfConfig } from "@/lib/store-videos";
import type {
  CardsSectionData, ContentBlockSectionData, EmbedSectionData, FaqSectionData, LogosSectionData,
} from "@/types/api";
import type { ProductVideosSectionData } from "@/types/page-sections";
import { SectionFrame, SectionHead } from "./section-parts";
import { blurProps } from "@/lib/blur";

/**
 * The sections that draw something that lives elsewhere: a live list, a
 * content block, a slider, a gallery, a form, the FAQs, a logo strip.
 *
 * A slider, gallery or form arrives as its **current slug** and is fetched
 * from its own public endpoint here, exactly as a shortcode is
 * (`ProseWithShortcodes`) — so "published and not empty" has one definition,
 * and a fetch that fails renders nothing rather than failing the page. A
 * content block arrives inline (`BlockView`), the one the shortcode renders.
 */

/** What each `cards` source is to a theme's collection idiom. */
const KIND: Record<string, string> = {
  solutions: "solutions", services: "services", industries: "industries", case_studies: "case-studies",
  blog: "posts", knowledge: "articles", products: "products", store_products: "products",
};

/**
 * A live list as the theme draws its grids — `Collection` of `Tile`s, so
 * Editorial rules it, Datacenter racks it and Terminal lists it without a
 * line here knowing. A tile's title is an `h3` under the section's `h2`, or
 * a `b` when the section has no heading.
 */
export function CardsSection({ data, eager, reveal }: { data: CardsSectionData; eager: boolean; reveal?: SectionRevealAttr | null }) {
  const cols = data.columns ?? 3;

  return (
    <SectionFrame type="cards" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <Collection kind={KIND[data.source] ?? "related"} cols={cols}>
          {data.items.map((item) => (
            <Tile
              key={item.path}
              href={item.path}
              titleAs={data.heading ? "h3" : "b"}
              title={item.title}
              kicker={item.kicker ?? undefined}
              summary={item.summary ?? undefined}
              meta={item.meta ?? undefined}
              icon={item.icon ? <IconTile name={item.icon} /> : undefined}
              hue={item.icon ? hueForIcon(item.icon) : undefined}
              focus={item.image_focus}
              media={item.image ? (
                <Image {...blurProps(item.image_blur)}
                  src={item.image}
                  alt={item.image_alt ?? ""}
                  fill
                  sizes={cols === 4 ? "(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw" : "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"}
                  loading={eager ? "eager" : undefined}
                  className="object-cover"
                />
              ) : undefined}
              cta="Learn more"
            />
          ))}
        </Collection>
        {data.index_path && (
          <p className="mt-8"><ArrowLink href={data.index_path}>See them all</ArrowLink></p>
        )}
      </Container>
    </SectionFrame>
  );
}

/**
 * The shop's "shop the videos" row as a builder section (0.140.0). The API
 * resolved `items` through `VideoShelf` — the list the shop front and the
 * homepage draw — and dropped the section when there were none. The look
 * (autoplay, SKU, consent) is Store → Product videos', read here from the
 * cached settings; the section's own `shape` wins over the setting's.
 */
export async function ProductVideosSection({ data, reveal }: { data: ProductVideosSectionData; reveal?: SectionRevealAttr | null }) {
  const settings = await getSiteSettings().catch(() => ({}) as SiteSettings);
  const config = videoShelfConfig(settings);

  return (
    <SectionFrame type="product_videos" reveal={reveal}>
      <Container>
        <SectionHead kicker={data.kicker} heading={data.heading} lede={data.lede} />
        <VideoShelfTiles
          rows={data.items}
          shape={data.shape ?? config.shape}
          autoplay={config.autoplay}
          showSku={config.showSku}
          consentGated={config.consentGated}
          titleAs={data.heading ? "h3" : "p"}
        />
      </Container>
    </SectionFrame>
  );
}

/** A published content block, drawn as a page section — `BlockView` brings its own band. */
export function ContentBlockSection({ data, reveal }: { data: ContentBlockSectionData; reveal?: SectionRevealAttr | null }) {
  return <div data-page-section="content_block" data-aos={reveal ?? undefined}><BlockView block={data.block} /></div>;
}

export async function SliderSection({ data, reveal }: { data: EmbedSectionData; reveal?: SectionRevealAttr | null }) {
  const slider = await publicApi.slider(data.slug).then((r) => r.data).catch(() => null);
  if (!slider) return null;

  return (
    <SectionFrame type="slider" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} />
        {/* Inside the container (90%, at most 1920px), never the whole screen: at the
            default "100vw" the browser fetched a wider picture than it draws. */}
        <SliderFor slider={slider} aspect="aspect-[16/9]" sizes="(min-width: 2134px) 1920px, 90vw" />
      </Container>
    </SectionFrame>
  );
}

export async function GallerySection({ data, reveal }: { data: EmbedSectionData; reveal?: SectionRevealAttr | null }) {
  const gallery = await publicApi.gallery(data.slug).then((r) => r.data).catch(() => null);
  if (!gallery) return null;

  return (
    <SectionFrame type="gallery" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading} />
        <Gallery gallery={gallery} />
      </Container>
    </SectionFrame>
  );
}

export async function FormSection({ data, reveal }: { data: EmbedSectionData; reveal?: SectionRevealAttr | null }) {
  const form = await publicApi.form(data.slug).then((r) => r.data).catch(() => null);
  if (!form) return null;

  return (
    <SectionFrame type="form" reveal={reveal}>
      <Container>
        <div className="mx-auto max-w-3xl">
          <SectionHead heading={data.heading} lede={data.lede} />
          {/* A form's own headings (a `heading` field, a step's title) sit one level under the section's — or at its level when it has none. */}
          <FormBlock form={form} headingLevel={data.heading ? 3 : 2} />
        </div>
      </Container>
    </SectionFrame>
  );
}

/**
 * Questions that open — the same `<details>` accordion the FAQs and the
 * question blocks use. No `FAQPage` here: the API's `faq_schema` already
 * counts these questions, and the page renders that one graph.
 */
export function FaqSection({ data, reveal }: { data: FaqSectionData; reveal?: SectionRevealAttr | null }) {
  if (!data.items.length) return null;

  return (
    <SectionFrame type="faq" reveal={reveal}>
      <Container>
        <SectionHead heading={data.heading || "Common questions"} />
        <QuestionAccordion items={data.items.map((q, i) => ({ key: i, question: q.question, answer: q.answer }))} />
      </Container>
    </SectionFrame>
  );
}

/**
 * How each theme moves its two strips on the homepage — `partners` (the
 * brands) and `clients` (Trusted by) — read here so a builder page's strip
 * moves the way the theme's homepage does. Mirrors the `mode` each theme's
 * `templates/home.tsx` passes; a theme missing here draws the strip as it
 * shipped (the marquee, and the flip wall for clients).
 */
const STRIP_MODES: Record<string, { brands?: StripMode; clients?: StripMode }> = {
  canvas: { brands: "rise", clients: "deal" },
  datacenter: { brands: "parallax", clients: "pulse" },
  editorial: { brands: "cascade", clients: "wipe" },
  enterprise: { brands: "ring", clients: "cascade" },
  horizon: { brands: "drift", clients: "spotlight" },
  keystone: { brands: "deal", clients: "lens" },
  launch: { brands: "lens", clients: "rise" },
  sentinel: { brands: "pulse", clients: "ring" },
  summit: { brands: "spotlight", clients: "bob" },
  terminal: { brands: "flicker", clients: "drift" },
  vantage: { brands: "bob", clients: "parallax" },
};

export async function LogosSection({ data, themeId, reveal }: { data: LogosSectionData; themeId: string; reveal?: SectionRevealAttr | null }) {
  const mode = STRIP_MODES[themeId]?.[data.source];

  if (data.source === "clients") {
    const clients = await publicApi.clients().then((r) => r.data).catch(() => []);
    const featured = clients.filter((c) => c.is_featured);
    const shown = (featured.length ? featured : clients).slice(0, 12);

    return (
      <div data-page-section="logos" data-aos={reveal ?? undefined}>
        <LogoMarquee
          items={shown.map((c) => ({ id: c.id, name: c.name, logo: c.logo, detail: c.industry?.name ?? null }))}
          caption={data.heading || undefined}
          variant={mode ? "logos" : "flip"}
          size="lg"
          mode={mode ?? "marquee"}
        />
      </div>
    );
  }

  const brands = await publicApi.brands().then((r) => r.data).catch(() => []);
  return (
    <div data-page-section="logos" data-aos={reveal ?? undefined}>
      <LogoMarquee items={brands} caption={data.heading || undefined} mode={mode ?? "marquee"} />
    </div>
  );
}
