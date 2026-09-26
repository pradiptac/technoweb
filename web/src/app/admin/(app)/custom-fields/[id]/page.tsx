import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getCustomFieldGroup } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { GroupForm } from "../group-form";
import { deleteGroupAction } from "../actions";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Edit field group", path: "/admin/custom-fields", seo: noIndex });

export default async function EditFieldGroupPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const { saved } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let res: Awaited<ReturnType<typeof getCustomFieldGroup>>;
  try {
    res = await getCustomFieldGroup(numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const group = res.data;
  const values = (group.fields ?? []).reduce((n, f) => n + f.values_count, 0);

  return (
    <>
      <PageHeader back={{ href: "/admin/custom-fields", label: "All field groups" }} title="Edit field group">
        <Badge tone={group.is_active ? "resolved" : "closed"}>{group.is_active ? "On" : "Off"}</Badge>
      </PageHeader>

      <GroupForm group={group} meta={res.meta} saved={Boolean(saved)} />

      {/* Outside the form: a nested form is invalid markup. */}
      <form action={deleteGroupAction} className="mt-10 border-t border-line pt-6">
        <input type="hidden" name="id" value={group.id} />
        {group.targets.map((t) => <input key={t} type="hidden" name="previous_targets" value={t} />)}
        <p className="mb-2 text-13 text-muted">
          Deleting this group deletes its {group.fields?.length ?? 0} field{(group.fields?.length ?? 0) === 1 ? "" : "s"}
          {values > 0 ? <> and the <strong>{values}</strong> value{values === 1 ? "" : "s"} typed into them</> : null}.
          Switching it off keeps everything instead.
        </p>
        <Button type="submit" variant="ghost" size="sm" className="text-err">Delete field group</Button>
      </form>
    </>
  );
}
