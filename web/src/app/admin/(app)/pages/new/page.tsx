import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PageForm } from "../page-form";

export const metadata = buildMetadata({ title: "New page", path: "/admin/pages/new", seo: noIndex });

export default function NewCmsPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/pages", label: "All pages" }}
        title="New page"
      />

      <PageForm />
    </>
  );
}
