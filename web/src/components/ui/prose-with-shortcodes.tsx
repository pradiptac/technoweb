import { Prose } from "@/components/ui/prose";
import { Slider } from "@/components/ui/slider";
import { publicApi } from "@/lib/api";
import { parseShortcodes, sliderSlugsIn } from "@/lib/shortcodes";
import type { Slider as SliderData } from "@/types/api";

/**
 * A CMS body with `[slider slug="…"]` shortcodes expanded.
 *
 * A server component, so the sliders are fetched during the render that needs
 * them rather than after hydration — a carousel that appears a beat late is
 * layout shift, and it would be shift below content the reader is already
 * looking at.
 *
 * One fetch per *distinct* slug, resolved before anything renders. A body that
 * embeds the same slider twice costs one request, and Next dedupes identical
 * fetches within a render anyway.
 *
 * A slug that does not resolve renders nothing. The alternative — leaving the
 * literal `[slider slug="typo"]` on the page, or printing an error — puts the
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

  const slugs = sliderSlugsIn(html);
  const resolved = new Map<string, SliderData>();

  await Promise.all(slugs.map(async (slug) => {
    try {
      const { data } = await publicApi.slider(slug);
      resolved.set(slug, data);
    } catch {
      // A missing or unpublished slider is an editorial state, not an error
      // worth failing a page over.
    }
  }));

  return (
    <>
      {segments.map((segment, i) =>
        segment.type === "html" ? (
          <Prose key={i} html={segment.html} className={className} />
        ) : resolved.has(segment.slug) ? (
          <Slider
            key={i}
            slider={resolved.get(segment.slug)!}
            aspect="aspect-[16/9]"
            className="my-8 max-w-[68ch]"
          />
        ) : null,
      )}
    </>
  );
}
