import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getTenderMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { TenderForm } from "../tender-form";

export const metadata = buildMetadata({ title: "New tender", path: "/admin/tenders/new", seo: noIndex });

export default async function NewTenderPage() {
  await requireScreen();

  let meta;
  try {
    // A new record has no `meta` of its own, so the index lends one row's —
    // the rule `/admin/events/new` and `/admin/forms/new` follow.
    meta = await getTenderMeta();
  } catch {
    return (
      <ErrorState title="We could not open the form">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/tenders", label: "All tenders" }}
        title="New tender"
        lede="A tender number, a scope of work and the two dates. It stays a draft until you publish it."
      />
      <TenderForm meta={meta} />
    </>
  );
}
