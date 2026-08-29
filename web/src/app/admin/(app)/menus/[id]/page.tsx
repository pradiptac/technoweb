import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMenu, getMenus } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { MenuEditor } from "../menu-editor";
import { DeleteMenu } from "../delete-menu";

export const metadata = buildMetadata({ title: "Edit menu", path: "/admin/menus", seo: noIndex });

export default async function EditMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let menu, meta;
  try {
    [menu, { meta }] = await Promise.all([getMenu(Number(id)), getMenus()]);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();
    return <ErrorState title="We could not load this menu">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader title={menu.name} back={{ href: "/admin/menus", label: "Menus" }}>
        <div className="ml-auto"><DeleteMenu id={menu.id} name={menu.name} /></div>
      </PageHeader>
      <MenuEditor menu={menu} meta={meta} />
    </>
  );
}
