import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { RedirectForm } from "../redirect-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New redirect", path: "/admin/redirects/new", seo: noIndex });

export default async function NewRedirectPage() {
  await requireScreen();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/redirects", label: "All redirects" }}
        title="New redirect"
      />

      <RedirectForm />
    </>
  );
}
