import { PageHeader } from "@/components/admin/page-header";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getStaffMember, getStaffRoles } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StaffForm } from "../staff-form";
import type { AdminStaff, RoleOption } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";
import { Card } from "@/components/ui/card";
import { NotificationsPanel } from "@/components/admin/notifications-panel";
import { getNotificationSettings } from "@/lib/admin";

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
  await requireScreen();
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
  const notifications = await getNotificationSettings(numericId).catch(() => null);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "All staff" }}
        title="Edit staff account"
      >
        {isSelf && <Badge tone="open">This is you</Badge>}
        {!staff.is_active && <Badge tone="closed">Inactive</Badge>}
      </PageHeader>

      <StaffForm
        staff={staff}
        roles={roles}
        isSelf={isSelf}
        saved={Boolean(saved)}
        blocked={Boolean(blocked)}
      />
      {notifications && (
        <Card as="section" interactive={false} padding="md" className="mt-8">
          <h2 className="mb-1 text-15 font-semibold">Notifications</h2>
          <p className="measure mb-5 text-13 text-muted">
            What this person is sent. They can change it on their own account; browsers are added there, by them.
          </p>
          {/* No pushConfig: an administrator cannot subscribe somebody else's browser. */}
          <NotificationsPanel prefs={notifications.data} meta={notifications.meta} pushConfig={null} />
        </Card>
      )}
    </>
  );
}
