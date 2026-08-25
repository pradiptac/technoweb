import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FormForm } from "../form-form";

export const metadata = buildMetadata({ title: "New form", path: "/admin/forms/new", seo: noIndex });

export default function NewFormPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/forms", label: "All forms" }} title="New form" />
      <FormForm />
    </>
  );
}
