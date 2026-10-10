import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonAnchor } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty";
import { ApiError } from "@/lib/api";
import { getStoreTag } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TagPageForm } from "./tag-page-form";
import type { AdminStoreTag } from "@/types/store-tags";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return buildMetadata({ title: "Edit tag page", path: `/admin/store/tags/${id}`, seo: noIndex });
}

/** Store → Tags → a tag's page (0.157.0, `docs/store.md` "Tags"). */
export default async function EditStoreTagPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let tag: AdminStoreTag;

  try {
    tag = await getStoreTag(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) {
      return (
        <ErrorState title="Store managers only">
          Shop tags are restricted to store manager and administrator accounts.
        </ErrorState>
      );
    }
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/store/tags", label: "Shop tags" }} title={tag.name}>
        {/* A plain anchor and a path: the browser supplies the origin (CLAUDE.md, "the three URLs"). */}
        {tag.public_path && <ButtonAnchor href={tag.public_path} variant="secondary" size="sm" className="ml-auto" target="_blank" rel="noopener">View page</ButtonAnchor>}
      </PageHeader>

      <TagPageForm tag={tag} />
    </>
  );
}
