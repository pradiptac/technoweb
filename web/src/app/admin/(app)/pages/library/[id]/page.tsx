import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { RevisionPanel } from "@/components/admin/revision-panel";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getPageBuilderOptions, getSavedSection } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { PageBuilderOptions, SavedSection } from "@/types/api";
import { LibraryEditor } from "./library-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit library item", path: `/admin/pages/library/${id}`, seo: noIndex });
}

export default async function EditLibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let item: SavedSection;
  let builder: PageBuilderOptions;
  try {
    [item, builder] = await Promise.all([getSavedSection(numericId), getPageBuilderOptions()]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // A section is one section and never a link; a template may hold links, so
  // it keeps the library to place from. Neither offers templates to start from.
  const options: PageBuilderOptions = {
    ...builder,
    library: item.kind === "template" && builder.library
      ? { sections: builder.library.sections, templates: [], categories: builder.library.categories }
      : undefined,
  };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pages/library", label: "Section library" }}
        title={item.kind === "template" ? "Edit page template" : "Edit library section"}
        lede={item.kind === "template"
          ? "A starting point for new pages. Changing it does not change pages already started from it."
          : "Pages that placed this section linked show the change as soon as it is saved; copies do not."}
      >
        <Badge tone="progress">{item.kind === "template" ? "Page template" : (item.type_label ?? "Section")}</Badge>
        <span className="ml-auto flex items-center gap-2">
          <RevisionPanel type="saved_section" id={item.id} />
        </span>
      </PageHeader>
      <LibraryEditor item={item} options={options} />
    </>
  );
}
