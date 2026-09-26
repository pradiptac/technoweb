import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getContentTypeList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TypeForm } from "../type-form";
import type { ContentTypeMeta } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New content type", path: "/admin/content-types/new", seo: noIndex });

export default async function NewContentTypePage() {
  await requireScreen();
  let meta: ContentTypeMeta;
  try {
    const res = await getContentTypeList({ per_page: 1 });
    meta = { sorts: res.meta.sorts, schema_types: res.meta.schema_types };
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/content-types", label: "All content types" }} title="New content type" />
      <TypeForm meta={meta} />
    </>
  );
}
