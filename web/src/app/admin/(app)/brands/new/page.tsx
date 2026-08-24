import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BrandForm } from "../brand-form";

export const metadata = buildMetadata({ title: "New brand", path: "/admin/brands/new", seo: noIndex });

export default function NewBrandPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/brands", label: "All brands" }}
        title="New brand"
      />

      <BrandForm />
    </>
  );
}
