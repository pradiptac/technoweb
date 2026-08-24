import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getFaqOwners } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { FaqForm } from "../faq-form";
import type { FaqOwnerGroup } from "@/types/api";

export const metadata = buildMetadata({ title: "New FAQ", path: "/admin/faqs/new", seo: noIndex });

export default async function NewFaqPage() {
  let owners: FaqOwnerGroup[] = [];
  try {
    owners = await getFaqOwners();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/faqs", label: "All FAQs" }}
        title="New FAQ"
      />

      <FaqForm owners={owners} />
    </>
  );
}
