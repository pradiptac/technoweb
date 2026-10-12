import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getStaffList, getSupportCentre } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { CentreForm } from "../centre-form";
import { deleteSupportCentreAction } from "../actions";

export const metadata = buildMetadata({ title: "Edit support centre", path: "/admin/support-centres", seo: noIndex });

export default async function EditSupportCentrePage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let res;
  try {
    res = await getSupportCentre(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const people = await getStaffList({ per_page: 100 }).then((r) => r.data).catch(() => []);
  const staff = people
    .filter((p) => p.is_active || res.data.staff?.some((s) => s.user_id === p.id))
    .map((p) => ({ id: p.id, name: p.name, email: p.email }));

  return (
    <>
      <PageHeader back={{ href: "/admin/support-centres", label: "Support network" }} title={res.data.name}>
        <Badge tone={res.data.is_active ? "resolved" : "progress"}>{res.data.is_active ? "Shown" : "Hidden"}</Badge>
      </PageHeader>

      <CentreForm centre={res.data} meta={res.meta} staffOptions={staff} />

      <form action={deleteSupportCentreAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={res.data.id} />
        <p className="mb-2 text-13 text-muted">Deleting takes the centre off the support network page. The staff accounts tagged to it are not touched.</p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete centre</Button>
      </form>
    </>
  );
}
