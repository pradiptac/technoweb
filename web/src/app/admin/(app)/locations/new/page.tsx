import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { locationPickers } from "../pickers";
import { LocationForm } from "../location-form";

export const metadata = buildMetadata({ title: "Add a place", path: "/admin/locations/new", seo: noIndex });


export default async function NewLocationPage() {
  const options = await locationPickers();

  return (
    <>
      <PageHeader title="Add a place" back={{ href: "/admin/locations", label: "Places" }} />
      <LocationForm {...options} />
    </>
  );
}
