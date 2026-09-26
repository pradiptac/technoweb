import { PageHeader } from "@/components/admin/page-header";
import { getAnswerBlockKinds } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ServiceForm } from "../service-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New service", path: "/admin/services/new", seo: noIndex });

export default async function NewServicePage() {
  await requireScreen();
  const kinds = await getAnswerBlockKinds("/admin/services");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/services", label: "All services" }}
        title="New service"
      />

      <ServiceForm kinds={kinds} />
    </>
  );
}
