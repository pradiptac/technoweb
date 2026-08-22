import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { getCurrentCustomer } from "@/lib/auth";
import { logoutAction } from "../actions";
import { PortalNav } from "./portal-nav";

/**
 * Every route under this layout requires a session. The login page sits
 * outside the (app) group deliberately — guarding it too would redirect
 * to itself forever.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();

  if (!customer) redirect("/portal/login");

  return (
    <div className="min-h-[80vh] bg-surface">
      <div className="border-b border-line bg-white">
        <Container className="flex flex-wrap items-center gap-3 py-5">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-[-.025em]">
              Support portal
            </h1>
            <p className="truncate text-[13.5px] text-muted">
              {customer.company ? `${customer.company} · ` : ""}{customer.email}
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
        <PortalNav />
        {/* The <main> landmark lives here, not around the nav: the root
            layout no longer supplies one, and the skip link targets it. */}
        <main id="main" className="min-w-0">{children}</main>
      </Container>
    </div>
  );
}
