import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/empty";
import { PageSections } from "@/components/page-sections/page-sections";
import { SectionsFrame } from "@/components/page-sections/sections-frame";
import { ApiError } from "@/lib/api";
import { getPage } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminPage } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Preview page", path: `/admin/pages/${id}/preview`, seo: noIndex });
}

/**
 * A builder page's **saved** sections, drafts and all, drawn as the public
 * site draws them (`docs/page-builder.md`). The admin read carries them
 * presented (`sections`), hidden ones already left out — so this shows what
 * publishing would show. The unsaved-draft preview is the dialog on the
 * form; this is the one a link can point at, and the one the audits reach.
 */
export default async function PreviewCmsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let page: AdminPage;
  try {
    page = await getPage(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const sections = page.sections ?? [];

  return (
    <>
      <PageHeader back={{ href: `/admin/pages/${page.id}`, label: "Back to the page" }} title={`Preview: ${page.title}`}>
        {page.status === "published" && (
          <Link href={`/${page.slug}`} className="ml-auto py-1 text-13-5 font-semibold text-brand-ink hover:underline">
            View on site ↗
          </Link>
        )}
      </PageHeader>

      {page.template !== "builder" ? (
        <EmptyState title="Not a builder page">This page renders its body. Choose the Builder template on the page to lay it out as sections.</EmptyState>
      ) : sections.length === 0 ? (
        <EmptyState title="No sections to show">Add a section on the page’s Builder tab, or show one that is hidden.</EmptyState>
      ) : (
        <SectionsFrame>
          <PageSections sections={sections} crumbs={[]} ownsH1={false} />
        </SectionsFrame>
      )}
    </>
  );
}
