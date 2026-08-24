import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceForm } from "../service-form";

export const metadata = buildMetadata({ title: "New service", path: "/admin/services/new", seo: noIndex });

export default function NewServicePage() {
  return (
    <>
      <PageHeader
        back={{ href: "/admin/services", label: "All services" }}
        title="New service"
      />

      <ServiceForm />
    </>
  );
}
