import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getStaffMember, getStaffRoles } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StaffForm } from "../staff-form";
import type { AdminStaff, RoleOption } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit staff account", path: `/admin/users/${id}`, seo: noIndex });
}

export default async function EditStaffPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; blocked?: string }>;
}) {
  const { id } = await params;
  const { saved, blocked } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let staff: AdminStaff;
  let roles: RoleOption[] = [];
  let me: Awaited<ReturnType<typeof getCurrentStaff>> = null;
  try {
    [staff, roles, me] = await Promise.all([
      getStaffMember(numericId), getStaffRoles(), getCurrentStaff(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The API refuses these regardless; knowing here lets the form say why
  // before somebody tries, and hide the delete button that cannot work.
  const isSelf = me?.id === staff.id;

  return (
    <>
      <Link href="/admin/users" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All staff
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <h2 className="display-3">Edit staff account</h2>
        {isSelf && <Badge tone="open">This is you</Badge>}
        {!staff.is_active && <Badge tone="closed">Inactive</Badge>}
      </div>

      <StaffForm
        staff={staff}
        roles={roles}
        isSelf={isSelf}
        saved={Boolean(saved)}
        blocked={Boolean(blocked)}
      />
    </>
  );
}
