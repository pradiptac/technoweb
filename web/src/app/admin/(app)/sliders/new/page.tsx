import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SliderForm } from "../slider-form";

export const metadata = buildMetadata({ title: "New slider", path: "/admin/sliders/new", seo: noIndex });

export default function NewSliderPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/sliders", label: "All sliders" }} title="New slider" />
      <SliderForm />
    </>
  );
}
