import { Prose } from "@/components/ui/prose";
import { Slider } from "@/components/ui/slider";
import { FormBlock } from "@/components/forms/form-block";
import { publicApi } from "@/lib/api";
import { parseShortcodes, slugsIn } from "@/lib/shortcodes";
import type { SiteForm, Slider as SliderData } from "@/types/api";

/**
 * A CMS body with `[slider slug="…"]` and `[form slug="…"]` expanded.
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
  const forms = new Map<string, SiteForm>();

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
            <Slider key={i} slider={slider} aspect="aspect-[16/9]" className="my-8" />
          ) : null;
        }

        const form = forms.get(segment.slug);
        return form ? <FormBlock key={i} form={form} className="my-8" /> : null;
      })}
    </>
  );
}
