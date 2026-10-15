import { FormBlock } from "@/components/forms/form-block";
import { Gallery } from "@/components/ui/gallery";
import { SliderFor } from "@/components/ui/slider-for";
import { publicApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LayoutWidget } from "@/types/api";
import type { WidgetPlan } from "./widgets";

/**
 * The layout section's form, slider and gallery widgets (0.149.0): a published
 * record named by its current slug, fetched from its own public endpoint and
 * drawn by the component the builder's own `form`, `slider` and `gallery`
 * sections use (`embed-sections.tsx`) — so "published and not empty" has one
 * definition, and a fetch that fails renders nothing rather than failing the
 * page.
 *
 * Async, so it lives apart from `Widget`'s plain switch; `Widget` returns
 * `<EmbedWidget>` for the three and a server component can render one.
 */
export async function EmbedWidget({
  widget, plan, hidden,
}: {
  widget: Extract<LayoutWidget, { type: "form" | "slider" | "gallery" }>;
  plan: WidgetPlan;
  hidden?: string;
}) {
  switch (widget.type) {
    case "form": {
      const form = await publicApi.form(widget.slug).then((r) => r.data).catch(() => null);
      if (!form) return null;

      // Its own headings (a `heading` field, a step's title) sit one level under
      // the section's `h2` — or at that level where none has come yet, or the
      // page skips one. `LayoutSection` does not count a form as the `h2`.
      return (
        <div data-widget="form" className={cn("min-w-0", hidden)}>
          <FormBlock form={form} headingLevel={plan.titleIsHeading ? 3 : 2} />
        </div>
      );
    }

    case "slider": {
      const slider = await publicApi.slider(widget.slug).then((r) => r.data).catch(() => null);
      if (!slider) return null;

      return (
        <div data-widget="slider" className={cn("min-w-0", hidden)}>
          <SliderFor
            slider={slider}
            aspect="aspect-[16/9]"
            sizes={`(min-width: 1024px) ${Math.max(15, Math.round(90 / Math.max(1, plan.columns)))}vw, 100vw`}
          />
        </div>
      );
    }

    case "gallery": {
      const gallery = await publicApi.gallery(widget.slug).then((r) => r.data).catch(() => null);
      if (!gallery) return null;

      return (
        <div data-widget="gallery" className={cn("min-w-0", hidden)}>
          <Gallery gallery={gallery} />
        </div>
      );
    }
  }
}
