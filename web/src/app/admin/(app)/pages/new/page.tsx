import { PageHeader } from "@/components/admin/page-header";
import { getAnswerBlockKinds } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { PageForm } from "../page-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New page", path: "/admin/pages/new", seo: noIndex });

export default async function NewCmsPage() {
  await requireScreen();
  const kinds = await getAnswerBlockKinds("/admin/pages");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/pages", label: "All pages" }}
        title="New page"
      />

      <PageForm kinds={kinds} />
    </>
  );
}
