import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getSliderList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { SliderForm } from "../slider-form";

export const metadata = buildMetadata({ title: "New slider", path: "/admin/sliders/new", seo: noIndex });

export default async function NewSliderPage() {
  /*
    The index is fetched for its `meta` alone — the transitions. They are sent
    by the API rather than listed in TypeScript, the same rule
    `schema_type_options` and `/admin/menus/new` follow: two hand-written
    copies of one list of strings is exactly the drift nothing type-checks
    across the wire.
  */
  let meta;
  try {
    ({ meta } = await getSliderList({ per_page: 1 }));
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/sliders", label: "All sliders" }} title="New slider" />
      <SliderForm
        transitions={meta.transitions ?? []}
        layouts={meta.layouts ?? []}
        captionPositions={meta.caption_positions ?? []}
      />
    </>
  );
}
