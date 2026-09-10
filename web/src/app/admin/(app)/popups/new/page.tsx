import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getPopupList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PopupForm } from "../popup-form";

export const metadata = buildMetadata({ title: "New popup", path: "/admin/popups/new", seo: noIndex });

export default async function NewPopupPage() {
  /*
    The index is fetched for its `meta` alone — the sections, the sizes and the
    frequencies. They are sent by the API rather than listed in TypeScript, the
    rule `schema_type_options` and `/admin/menus/new` follow: two hand-written
    copies of one list of strings is exactly the drift nothing type-checks
    across the wire. `SiteSection` in particular must not cross it at all.
  */
  let meta;
  try {
    ({ meta } = await getPopupList({ per_page: 1 }));
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/popups", label: "All popups" }} title="New popup" />
      <PopupForm meta={meta} />
    </>
  );
}
