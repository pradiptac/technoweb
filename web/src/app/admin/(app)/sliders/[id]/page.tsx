import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getSlider, type SlideCaptionPositionOption, type SliderTransitionOption } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { Alert } from "@/components/ui/input";
import { SliderForm } from "../slider-form";
import { DeleteSlider } from "../delete-slider";
import type { Slider } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Edit slider", path: "/admin/sliders", seo: noIndex });

export default async function EditSliderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; kept?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const { saved, kept } = await searchParams;

  let slider: Slider;
  let transitions: SliderTransitionOption[] = [];
  let captionAnimations: SliderTransitionOption[] = [];
  let layouts: SliderTransitionOption[] = [];
  let captionPositions: SlideCaptionPositionOption[] = [];
  try {
    const res = await getSlider(Number(id));
    slider = res.data;
    transitions = res.meta.transitions ?? [];
    captionAnimations = res.meta.caption_animations ?? [];
    layouts = res.meta.layouts ?? [];
    captionPositions = res.meta.caption_positions ?? [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/sliders", label: "All sliders" }} title="Edit slider">
        <Badge tone={slider.status === "published" ? "resolved" : "progress"}>
          {slider.slides?.length ?? 0} slide{(slider.slides?.length ?? 0) === 1 ? "" : "s"}
        </Badge>
      </PageHeader>
      <SliderForm
        slider={slider}
        transitions={transitions}
        captionAnimations={captionAnimations}
        layouts={layouts}
        captionPositions={captionPositions}
        saved={Boolean(saved)}
      />

      {/* Outside the form: a delete button inside another form's markup is a
          nested form, which is invalid and which browsers resolve by dropping
          one of them. */}
      <div className="mt-10 border-t border-line pt-6">
        {kept && (
          <Alert tone="err" title="Not deleted">
            The API refused it. A slider a page reads by name is deleted only from
            the confirmation below.
          </Alert>
        )}
        <p className="mb-2 text-13 text-muted">
          Deleting this removes its slides. Anything embedding{" "}
          <code className="font-mono text-12-5">{`[slider slug="${slider.slug}"]`}</code>{" "}
          will render nothing in its place.
        </p>
        <DeleteSlider
          id={slider.id}
          slug={slider.slug}
          name={slider.name}
          reservedFor={slider.reserved_for ?? null}
          slideCount={slider.slides?.length ?? 0}
        />
      </div>
    </>
  );
}
