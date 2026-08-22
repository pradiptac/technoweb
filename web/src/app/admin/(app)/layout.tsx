import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/settings";
import { logoutAction } from "./actions";
import { AdminNav } from "./admin-nav";

/**
 * Every route under this layout requires a staff session. The login page
 * sits outside the (app) group deliberately — guarding it too would redirect
 * to itself forever. Mirrors portal/(app)/layout.tsx.
 *
 * The bar is deliberately thin. It used to be an 89px banner carrying an
 * <h1> that said "Admin console" on all 46 screens — a heading that described
 * the furniture rather than the page, and 125px of the viewport gone before
 * any content. The page's own <h1> now lives in the content area, which is
 * both denser and the right way round semantically.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [staff, settings] = await Promise.all([getCurrentStaff(), getSiteSettings()]);

  if (!staff) redirect("/admin/login");

  const roles = staff.roles.map((r) => r.label).join(", ");

  return (
    <div className="min-h-screen bg-surface">
      <div className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-[10px]">
        <Container className="flex h-13 items-center gap-3">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <Logo className="text-[17px]" logoUrl={settings.logo_url} companyName={settings.company_name} />
            <span className="hidden text-[12px] font-semibold uppercase tracking-[.09em] text-faint sm:inline">
              Console
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-1">
            <Link
              href="/"
              className="hidden rounded px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:block"
            >
              View site
            </Link>

            {/* Their own name reaches their own account — every role can,
                unlike the Staff screen. The roles sit in the title so they are
                available without spending a line on them. */}
            <Link
              href="/admin/profile"
              title={roles ? `${staff.name} · ${roles}` : staff.name}
              className="max-w-[22ch] truncate rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2"
            >
              {staff.name}
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded border border-line-strong bg-white px-2.5 py-1.5 text-[13px] font-semibold transition-colors hover:border-faint"
              >
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </div>

      <Container className="grid gap-6 py-5 lg:grid-cols-[176px_1fr] lg:gap-9">
        <AdminNav />
        {/* The <main> landmark lives here, not around the nav: the root
            layout no longer supplies one, and the skip link targets it. */}
        <main id="main" className="min-w-0">{children}</main>
      </Container>
    </div>
  );
}
