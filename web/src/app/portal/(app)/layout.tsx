import { Suspense } from "react";
import Link from "next/link";
import { CreditLine } from "@/components/layout/credit-line";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ToastProvider } from "@/components/ui/toast";
import { ToastFromParams } from "@/components/ui/toast-from-params";
import { getCurrentCustomer, isImpersonated } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { portalEnabled } from "@/lib/site-settings";
import { PortalClosed } from "@/components/portal/portal-closed";
import { motionAttrs, motionFor } from "@/lib/motion-choices";
import { PageEnter } from "@/components/ui/page-enter";
import { RouteProgress } from "@/components/ui/route-progress";
import { logoutAction } from "../actions";
import { PortalNav } from "./portal-nav";
import { ImpersonationBanner } from "./impersonation-banner";
import { knowledgeBaseIcon, portalLinks } from "./portal-links";
import { Button } from "@/components/ui/button";
import { PushBell } from "@/components/push/push-bell";
import { pushConfigFrom } from "@/lib/push";
import { brandName } from "@/lib/brand";

/**
 * Every route under this layout requires a session. The login page sits
 * outside the (app) group deliberately — guarding it too would redirect
 * to itself forever.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // For the footer's company name, and the switch below. ISR-cached and
  // shared with every other read of it, so this costs a revalidation rather
  // than a round trip.
  const settings = await getSiteSettings();

  // The portal switched off (`portal_enabled`): the API refuses every route
  // under here with `portal_disabled`, so say so rather than redirecting to
  // a sign-in form that would only refuse too.
  if (!portalEnabled(settings)) return <PortalClosed settings={settings} />;

  const customer = await getCurrentCustomer();

  if (!customer) redirect("/portal/login");

  // A staff member's "View as" session — the same cached `/auth/me` read.
  const impersonated = await isImpersonated();

  // The Motion settings apply to the portal as to the public site — a
  // customer sees one product — and are stamped on this wrapper for the
  // reason the marketing layout gives. The splash is not here: a splash
  // after signing in is noise.
  const motion = motionFor(settings);
  const push = pushConfigFrom(settings);

  /*
    The toast region wraps the whole area rather than sitting inside <main>.

    It is chrome about what just happened, not part of what the page says —
    the same argument that puts ScrollTop outside the landmark. Inside <main>
    it would also be one more thing between the skip link and the content.
  */
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-surface" {...motionAttrs(motion)}>
        {motion.loader !== "none" && (
          <Suspense fallback={null}>
            <RouteProgress style={motion.loader as "bar" | "pulse"} />
          </Suspense>
        )}
        {impersonated && <ImpersonationBanner customer={customer} />}
        <div className="border-b border-line bg-card">
          <Container className="flex flex-wrap items-center gap-3 py-5">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-[-.025em]">
                Support portal
              </h1>
              <p className="truncate text-13-5 text-muted">
                {customer.company ? `${customer.company} · ` : ""}{customer.email}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Order and ticket updates in this browser (Phase 2). A staff
                  member viewing as the customer is not offered it: the
                  subscription would be their browser, not the customer's. */}
              {push && !impersonated && <PushBell config={push} consentGated={false} />}
              <Link
                href="/"
                className="rounded px-3.5 py-2.5 text-13-5 font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Back to site
              </Link>
              <form action={logoutAction}>
                <Button type="submit" variant="secondary" size="sm">Sign out</Button>
              </form>
            </div>
          </Container>
        </div>

        <Container className="grid flex-1 gap-8 py-9 lg:grid-cols-[210px_1fr] lg:gap-12">
          <PortalNav links={portalLinks()} knowledgeBaseIcon={knowledgeBaseIcon} />
          {/* The <main> landmark lives here, not around the nav: the root
              layout no longer supplies one, and the skip link targets it. */}
          <main id="main" className="min-w-0"><PageEnter>{children}</PageEnter></main>
        </Container>

        {/* The same one line the public site and the console carry. The portal
            had no copyright at all, which is the sort of omission nobody sees
            until a customer screenshots a page of it. */}
        <footer className="mt-auto border-t border-line py-3.5">
          <Container>
            <CreditLine
              companyName={settings.company_name ?? brandName()}
              className="text-center text-12-5 text-faint"
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
