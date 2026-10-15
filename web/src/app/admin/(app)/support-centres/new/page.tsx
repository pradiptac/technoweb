import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getStaffList, getSupportCentreList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { CentreForm } from "../centre-form";

export const metadata = buildMetadata({ title: "New support centre", path: "/admin/support-centres/new", seo: noIndex });

export default async function NewSupportCentrePage() {
  await requireScreen();
  let meta, staff;
  try {
    const [list, people] = await Promise.all([getSupportCentreList({ per_page: 1 }), getStaffList({ per_page: 100 })]);
    meta = { kinds: list.meta.kinds, countries: list.meta.countries };
    staff = people.data.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name, email: p.email }));
  } catch {
    return <ErrorState title="We could not load the form">The admin API is not responding. Try again shortly.</ErrorState>;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/support-centres", label: "Support network" }} title="New support centre" />
      <CentreForm meta={meta} staffOptions={staff} />
    </>
  );
}
