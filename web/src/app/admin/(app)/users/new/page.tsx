import Link from "next/link";
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
      <Link href="/admin/users" className="inline-block py-1 text-[13.5px] font-semibold text-brand-600 hover:underline">
        ← All staff
      </Link>
      <h2 className="display-3 mt-4 mb-6">New staff account</h2>

      <StaffForm roles={roles} />
    </>
  );
}
