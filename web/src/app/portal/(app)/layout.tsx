import { Suspense } from "react";
import Link from "next/link";
import { CreditLine } from "@/components/layout/credit-line";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ToastProvider } from "@/components/ui/toast";
import { ToastFromParams } from "@/components/ui/toast-from-params";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
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

  // For the footer's company name. ISR-cached and shared with every other
  // read of it, so this costs a revalidation rather than a round trip.
  const settings = await getSiteSettings();

  /*
    The toast region wraps the whole area rather than sitting inside <main>.

    It is chrome about what just happened, not part of what the page says —
    the same argument that puts ScrollTop outside the landmark. Inside <main>
    it would also be one more thing between the skip link and the content.
  */
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-surface">
        <div className="border-b border-line bg-card">
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
                  className="rounded border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors hover:border-faint"
                >
                  Sign out
                </button>
              </form>
            </div>
          </Container>
        </div>

        <Container className="grid flex-1 gap-8 py-9 lg:grid-cols-[210px_1fr] lg:gap-12">
          <PortalNav />
          {/* The <main> landmark lives here, not around the nav: the root
              layout no longer supplies one, and the skip link targets it. */}
          <main id="main" className="min-w-0">{children}</main>
        </Container>

        {/* The same one line the public site and the console carry. The portal
            had no copyright at all, which is the sort of omission nobody sees
            until a customer screenshots a page of it. */}
        <footer className="mt-auto border-t border-line py-3.5">
          <Container>
            <CreditLine
              companyName={settings.company_name ?? "Technoware"}
              className="text-center text-[12.5px] text-faint"
              linkClassName="font-medium text-muted hover:text-ink hover:underline"
            />
          </Container>
        </footer>
      </div>

      {/* Suspense: useSearchParams needs one, and this renders nothing. */}
      <Suspense fallback={null}><ToastFromParams /></Suspense>
    </ToastProvider>
  );
}
