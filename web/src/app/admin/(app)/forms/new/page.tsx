import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { noIndex } from "@/lib/no-index";
import { getFormMeta } from "@/lib/admin";
import { FormForm } from "../form-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New form", path: "/admin/forms/new", seo: noIndex });

export default async function NewFormPage() {
  await requireScreen();

  /*
    The kinds, operators and upload families the builder offers. A new form has
    no record to read them off, so the index is asked — and a failure there is
    not a reason to refuse the screen: the builder falls back to the kinds every
    API accepts, and the save reports whatever is actually wrong.
  */
  const meta = await getFormMeta().catch(() => undefined);

  return (
    <>
      <PageHeader back={{ href: "/admin/forms", label: "All forms" }} title="New form" />
      <FormForm meta={meta} site={siteUrl()} />
    </>
  );
}
