import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { CertificationForm } from "../certification-form";

export const metadata = buildMetadata({ title: "New certification", path: "/admin/certifications/new", seo: noIndex });

export default function NewCertificationPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/certifications", label: "All certifications" }} title="New certification" />
      <CertificationForm />
    </>
  );
}
