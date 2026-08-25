import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getSlider } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { Button } from "@/components/ui/button";
import { SliderForm } from "../slider-form";
import { deleteSliderAction } from "../actions";
import type { Slider } from "@/types/api";

export const metadata = buildMetadata({ title: "Edit slider", path: "/admin/sliders", seo: noIndex });

export default async function EditSliderPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  let slider: Slider;
  try {
    slider = await getSlider(Number(id));
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
      <SliderForm slider={slider} saved={Boolean(saved)} />

      {/* Outside the form: a delete button inside another form's markup is a
          nested form, which is invalid and which browsers resolve by dropping
          one of them. */}
      <form action={deleteSliderAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={slider.id} />
        <input type="hidden" name="slug" value={slider.slug} />
        <p className="mb-2 text-[13px] text-muted">
          Deleting this removes its slides. Anything embedding{" "}
          <code className="font-mono text-[12.5px]">{`[slider slug="${slider.slug}"]`}</code>{" "}
          will render nothing in its place.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete slider</Button>
      </form>
    </>
  );
}
