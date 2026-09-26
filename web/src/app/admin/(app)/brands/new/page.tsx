import { PageHeader } from "@/components/admin/page-header";
import { getAnswerBlockKinds } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BrandForm } from "../brand-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New brand", path: "/admin/brands/new", seo: noIndex });

export default async function NewBrandPage() {
  await requireScreen();
  const kinds = await getAnswerBlockKinds("/admin/brands");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/brands", label: "All brands" }}
        title="New brand"
      />

      <BrandForm kinds={kinds} />
    </>
  );
}
