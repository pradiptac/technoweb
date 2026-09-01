import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getGalleryList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { GalleryForm } from "../gallery-form";

export const metadata = buildMetadata({ title: "New gallery", path: "/admin/galleries/new", seo: noIndex });

export default async function NewGalleryPage() {
  /*
    The index is fetched for its `meta` alone — the transitions. They are sent
    by the API rather than listed in TypeScript, the same rule
    `schema_type_options` and `/admin/menus/new` follow: two hand-written
    copies of one list of strings is exactly the drift nothing type-checks
    across the wire.
  */
  let meta;
  try {
    ({ meta } = await getGalleryList({ per_page: 1 }));
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/galleries", label: "All galleries" }} title="New gallery" />
      <GalleryForm transitions={meta.transitions ?? []} />
    </>
  );
}
