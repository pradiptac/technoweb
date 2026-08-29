import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMenus } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { MenuEditor } from "../menu-editor";

export const metadata = buildMetadata({ title: "New menu", path: "/admin/menus/new", seo: noIndex });

export default async function NewMenuPage() {
  /*
    The index is fetched for its `meta` alone — the locations and the item
    types. Both are sent by the API rather than listed in TypeScript, the same
    rule `schema_type_options` follows: two hand-written copies of one list of
    strings is exactly the drift nothing type-checks across the wire.
  */
  let meta;
  try {
    ({ meta } = await getMenus());
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader title="New menu" back={{ href: "/admin/menus", label: "Menus" }} />
      <MenuEditor menu={null} meta={meta} />
    </>
  );
}
