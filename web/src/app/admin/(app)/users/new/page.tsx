import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getStaffRoles } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { StaffForm } from "../staff-form";
import type { RoleOption } from "@/types/api";

export const metadata = buildMetadata({ title: "New staff account", path: "/admin/users/new", seo: noIndex });

export default async function NewStaffPage() {
  let roles: RoleOption[] = [];
  try {
    roles = await getStaffRoles();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "All staff" }}
        title="New staff account"
      />

      <StaffForm roles={roles} />
    </>
  );
}
