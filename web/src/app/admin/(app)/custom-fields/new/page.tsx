import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getCustomFieldGroupMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { GroupForm } from "../group-form";
import type { CustomFieldGroupMeta } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New field group", path: "/admin/custom-fields/new", seo: noIndex });

export default async function NewFieldGroupPage() {
  await requireScreen();
  let meta: CustomFieldGroupMeta;
  try {
    meta = await getCustomFieldGroupMeta();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/custom-fields", label: "All field groups" }} title="New field group" />
      <GroupForm meta={meta} />
    </>
  );
}
