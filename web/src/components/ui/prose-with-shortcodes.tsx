import { Prose } from "@/components/ui/prose";
import { SliderFor } from "@/components/ui/slider-for";
import { Gallery } from "@/components/ui/gallery";
import { FormBlock } from "@/components/forms/form-block";
import { BlockView } from "@/components/blocks/block-view";
import { publicApi } from "@/lib/api";
import { parseShortcodes, slugsIn } from "@/lib/shortcodes";
import type { ContentBlock, Gallery as GalleryData, SiteForm, Slider as SliderData } from "@/types/api";

/**
 * A CMS body with `[slider slug="…"]`, `[gallery slug="…"]` and
 * `[form slug="…"]` expanded.
 *
 * A server component, so both are fetched during the render that needs them
 * rather than after hydration — something that appears a beat late is layout
 * shift, and it would be shift below content the reader is already looking at.
 *
 * One fetch per *distinct* slug, resolved before anything renders. A body that
 * embeds the same form twice costs one request, and Next dedupes identical
 * fetches within a render anyway.
 *
 * A slug that does not resolve renders nothing. The alternative — leaving the
 * literal `[form slug="typo"]` on the page, or printing an error — puts the
 * CMS's internals in front of a visitor to report a mistake only an editor can
 * fix, and the admin form is where that belongs.
 */
export async function ProseWithShortcodes({ html, className }: { html: string; className?: string }) {
  const segments = parseShortcodes(html);

  // The common case is a body with no shortcode at all: one regex, no fetches,
  // and the same markup Prose has always produced.
  if (segments.length === 1 && segments[0].type === "html") {
    return <Prose html={html} className={className} />;
  }

  const sliders = new Map<string, SliderData>();
  const galleries = new Map<string, GalleryData>();
  const forms = new Map<string, SiteForm>();
  const blocks = new Map<string, ContentBlock>();
  const blockKinds = ["cta", "stats", "pricing", "stack"] as const;

  await Promise.all([
    ...slugsIn(html, "slider").map(async (slug) => {
      try {
        const { data } = await publicApi.slider(slug);
        sliders.set(slug, data);
      } catch {
        // A missing or unpublished slider is an editorial state, not an error
        // worth failing a page over.
      }
    }),
    ...slugsIn(html, "gallery").map(async (slug) => {
      try {
        const { data } = await publicApi.gallery(slug);
        galleries.set(slug, data);
      } catch {
        // A missing, unpublished or empty gallery is an editorial state. The
        // API answers 404 for an empty one deliberately, so this is the branch
        // that turns "somebody has not added the pictures yet" into a section
        // that is simply absent rather than a tab strip with nothing under it.
      }
    }),
    // One fetch per distinct block slug, whichever of the four shortcodes named it.
    ...[...new Set(blockKinds.flatMap((kind) => slugsIn(html, kind)))].map(async (slug) => {
      try {
        const { data } = await publicApi.block(slug);
        blocks.set(slug, data);
      } catch {
        // A draft, an unknown slug or an empty block renders nothing.
      }
    }),
    ...slugsIn(html, "form").map(async (slug) => {
      try {
        const { data } = await publicApi.form(slug);
        forms.set(slug, data);
      } catch {
        // Same for a form.
      }
    }),
  ]);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "html") {
          return <Prose key={i} html={segment.html} className={className} />;
        }

        if (segment.type === "slider") {
          const slider = sliders.get(segment.slug);
          return slider ? (
            <SliderFor key={i} slider={slider} aspect="aspect-[16/9]" className="my-8" />
          ) : null;
        }

        if (segment.type === "gallery") {
          const gallery = galleries.get(segment.slug);
          return gallery ? <Gallery key={i} gallery={gallery} className="my-8" /> : null;
        }

        if (segment.type === "cta" || segment.type === "stats" || segment.type === "pricing" || segment.type === "stack") {
          const block = blocks.get(segment.slug);
          // `[cta slug="x"]` naming a stat bar renders nothing: the shortcode
          // is a claim about what the block is, and a mismatch is a typo.
          return block && block.type === segment.type ? <BlockView key={i} block={block} embedded /> : null;
        }

        const form = forms.get(segment.slug);
        // `headingLevel={2}`: a body's own top level is `h2` (the sanitiser
        // refuses an `h1`), and nothing says one comes before the shortcode —
        // so a heading inside the form is a peer of the body's sections, which
        // can never skip a level.
        return form ? <FormBlock key={i} form={form} className="my-8" headingLevel={2} /> : null;
      })}
    </>
  );
}
