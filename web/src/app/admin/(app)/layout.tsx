import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { getCurrentStaff } from "@/lib/admin-auth";
import { logoutAction } from "./actions";
import { AdminNav } from "./admin-nav";

/**
 * Every route under this layout requires a staff session. The login page
 * sits outside the (app) group deliberately — guarding it too would redirect
 * to itself forever. Mirrors portal/(app)/layout.tsx.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();

  if (!staff) redirect("/admin/login");

  return (
    <div className="min-h-[80vh] bg-surface">
      <div className="border-b border-line bg-white">
        <Container className="flex flex-wrap items-center gap-3 py-5">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-[-.025em]">
              Admin console
            </h1>
            <p className="truncate text-[13.5px] text-muted">
              {/* Their own name is the natural place to reach their own
                  account — every role can, unlike the Staff screen. */}
              <Link href="/admin/profile" className="font-medium hover:text-ink hover:underline">
                {staff.name}
              </Link>
              {staff.roles.length ? ` · ${staff.roles.map((r) => r.label).join(", ")}` : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Back to site
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded border border-line-strong bg-white px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors hover:border-faint"
              >
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </div>

      <Container className="grid gap-8 py-9 lg:grid-cols-[210px_1fr] lg:gap-12">
        <AdminNav />
        {/* The <main> landmark lives here, not around the nav: the root
            layout no longer supplies one, and the skip link targets it. */}
        <main id="main" className="min-w-0">{children}</main>
      </Container>
    </div>
  );
}
