import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getIndustries } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { ClientForm } from "../client-form";

export const metadata = buildMetadata({ title: "New client", path: "/admin/clients/new", seo: noIndex });

export default async function NewClientPage() {
  let industries;
  try {
    industries = await getIndustries();
  } catch {
    return <ErrorState title="We could not load this screen">The admin API is not responding.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/clients", label: "All clients" }} title="New client" />
      <ClientForm industries={industries} />
    </>
  );
}
