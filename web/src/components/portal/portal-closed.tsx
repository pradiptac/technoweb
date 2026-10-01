import { AuthLayout } from "@/components/layout/auth-layout";
import { ButtonLink } from "@/components/ui/button";
import type { SiteSettings } from "@/lib/site-settings";

/**
 * What every `/portal/*` page renders while `portal_enabled` is off.
 *
 * The API refuses every customer route with `reason: portal_disabled`, so a
 * sign-in form here would only ever show a refusal; this says so up front
 * and points at the two doors that still work. Rendered in place rather than
 * as a 404: somebody arriving from an old email link is owed a sentence
 * about the portal, not "page not found". Every portal page is `noindex`
 * already and `/portal/` is disallowed in robots.txt, so nothing indexes it.
 *
 * Used by the `(app)` layout and each page outside it (login, register and
 * its check-your-email step, forgot and reset password, verify email).
 */
export function PortalClosed({ settings }: { settings: SiteSettings }) {
  return (
    <AuthLayout
      settings={settings}
      title="The customer portal is not available"
      lede="Signing in, tickets and order history online are switched off at the moment. We can still help — get in touch and the team will answer directly."
    >
      <div className="grid gap-3">
        <ButtonLink href="/contact">Contact us</ButtonLink>
        <ButtonLink href="/" variant="secondary">Back to the site</ButtonLink>
      </div>
    </AuthLayout>
  );
}
