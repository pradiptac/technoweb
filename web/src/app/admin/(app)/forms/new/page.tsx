import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { noIndex } from "@/lib/no-index";
import { FormForm } from "../form-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New form", path: "/admin/forms/new", seo: noIndex });

export default async function NewFormPage() {
  await requireScreen();
  return (
    <>
      <PageHeader back={{ href: "/admin/forms", label: "All forms" }} title="New form" />
      <FormForm site={siteUrl()} />
    </>
  );
}
