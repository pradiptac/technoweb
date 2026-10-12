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
import { lookAttrs, lookFor } from "@/lib/look";
import { PortalClosed } from "@/components/portal/portal-closed";
import { motionAttrs, motionFor } from "@/lib/motion-choices";
import { PageEnter } from "@/components/ui/page-enter";
import { RouteProgress } from "@/components/ui/route-progress";
import { logoutAction } from "../actions";
import { PortalNav } from "./portal-nav";
import { ImpersonationBanner } from "./impersonation-banner";
import { knowledgeBaseIcon, portalLinks } from "./portal-links";
import { PushBell } from "@/components/push/push-bell";
import { pushConfigFrom } from "@/lib/push";
import { brandName } from "@/lib/brand";
import { Logo } from "@/components/layout/logo";
import { TopBar } from "@/components/app-shell/top-bar";
import { IconAccessCard, IconGlobe } from "@/components/icons";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { getTicketSummary } from "@/lib/portal";

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

  // The sidebar's ticket badge: what is open or waiting. One cached read the
  // home page makes too; a failure is simply no badge.
  const summary = await getTicketSummary().catch(() => null);
  const openTickets = summary ? summary.open + summary.in_progress + summary.pending : 0;

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
      <div data-portal className="flex min-h-screen flex-col bg-surface" {...motionAttrs(motion)} {...lookAttrs(lookFor(settings))}>
        {motion.loader !== "none" && (
          <Suspense fallback={null}>
            <RouteProgress style={motion.loader as "bar" | "pulse"} />
          </Suspense>
        )}
        {impersonated && <ImpersonationBanner customer={customer} />}
        {/*
          Console 2.0's glass bar, in the portal (0.167.0): the website's own
          logo — the portal had none, only a heading saying "Support portal"
          — the browser bell, and the account menu holding the profile, the
          way back to the site and Sign out. The page names itself with its
          own h1 now.
        */}
        <TopBar
          brand={
            <Link href="/portal" className="flex shrink-0 items-center">
              <Logo
                className="text-17"
                logoUrl={settings.logo_url}
                logoWidth={settings.logo_width}
                logoHeight={settings.logo_height}
                companyName={settings.company_name}
              />
            </Link>
          }
        >
          {/* Order and ticket updates in this browser (Phase 2). A staff
              member viewing as the customer is not offered it: the
              subscription would be their browser, not the customer's. */}
          {push && !impersonated && <PushBell config={push} consentGated={false} />}
          <AccountMenu
            name={customer.name}
            detail={customer.company ?? customer.email}
            items={[
              { label: "My profile", href: "/portal/profile", icon: <IconAccessCard /> },
              { label: "Back to site", href: "/", icon: <IconGlobe /> },
            ]}
            signOut={logoutAction}
          />
        </TopBar>

        <Container className="grid flex-1 gap-8 py-9 lg:grid-cols-[210px_1fr] lg:gap-12">
          <PortalNav links={portalLinks({ openTickets })} knowledgeBaseIcon={knowledgeBaseIcon} />
          {/* The <main> landmark lives here, not around the nav: the root
              layout no longer supplies one, and the skip link targets it. */}
          <main id="main" className="min-w-0"><PageEnter transition={motion.page}>{children}</PageEnter></main>
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
