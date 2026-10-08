import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomerOrNull } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { portalEnabled, settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LoginForm } from "./login-form";
import { safeReturnPath } from "@/lib/safe-return";
import { brandName } from "@/lib/brand";
import { PortalClosed } from "@/components/portal/portal-closed";
import { GoogleButton } from "@/components/auth/google-button";
import { Alert } from "@/components/ui/input";
import { GOOGLE_NOTICES } from "@/lib/google-signin";

export const metadata = buildMetadata({
  title: "Customer login",
  description: `Sign in to the ${brandName()} support portal to raise and track tickets.`,
  path: "/portal/login",
  seo: noIndex,
});

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return?: string; google?: string }> }) {
  /*
    Where to go afterwards — a same-site path only (`safeReturnPath`), so a
    link mailed to somebody cannot use this form to send them off-site. The
    shop's "Sign in to write a review" is what passes one.
  */
  const query = await searchParams;
  const returnTo = safeReturnPath(query.return);
  // Why a Google sign-in ended back here — a key looked up, never a sentence from the URL.
  const googleNotice = typeof query.google === "string" && Object.hasOwn(GOOGLE_NOTICES, query.google)
    ? GOOGLE_NOTICES[query.google]
    : null;

  const settings = await getSiteSettings();
  // The portal switched off (`portal_enabled`): one page for every door in.
  if (!portalEnabled(settings)) return <PortalClosed settings={settings} />;

  // Already signed in — no reason to show the form again.
  // `…OrNull`, so an unreachable API renders the form rather than a 500.
  if (await getCurrentCustomerOrNull()) redirect(returnTo);
  const canRegister = settingEnabled(settings, "registration_enabled");
  // One derived bit from the API: the switch *and* a whole OAuth client.
  const googleLive = settingEnabled(settings, "google_login_live");

  return (
    <AuthLayout
      settings={settings}
      title="Customer login"
      lede="Raise a ticket, track your orders and see your full support history."
      footer={
        /*
          Only the closed-registration case still uses this slot. With
          registration open, `LoginForm` renders its own short "Don't have an
          account? Register" link below the sign-in options instead — this
          sentence used to fill the same job here, buried under a border at
          the bottom of the form rather than beside the thing it is an
          alternative to.
        */
        !canRegister && (
          <>
            No portal account yet?{" "}
            <Link href="/contact" className="font-semibold text-brand-ink hover:underline">
              Ask your account engineer
            </Link>{" "}
            — logins are issued with your AMC contract.
          </>
        )
      }
    >
      {/*
        Which ways in are offered, read on the server.

        `settingEnabled` rather than a truthiness check: settings arrive as
        strings and "0" is truthy in JavaScript, so `if (settings.x)` is true
        for a switch that is off.
      */}
      {googleNotice && (
        // Its own bottom margin: the button under it is not a field, so nothing else spaces the two.
        <div className="mb-5">
          <Alert tone={googleNotice.tone} title={googleNotice.title} dismissible={false}>{googleNotice.body}</Alert>
        </div>
      )}
      <LoginForm
        before={googleLive ? <GoogleButton returnTo={returnTo === "/portal" ? undefined : returnTo} /> : undefined}
        otpEnabled={settingEnabled(settings, "otp_login_enabled")}
        /* A string over the wire, so it is compared rather than coerced — the
           trap `settingEnabled` exists for, where "0" is truthy in JavaScript. */
        defaultMethod={settings.default_login_method === "password" ? "password" : "otp"}
        passwordEnabled={settingEnabled(settings, "password_login_enabled")}
        canRegister={canRegister}
        returnTo={returnTo === "/portal" ? undefined : returnTo}
      />
    </AuthLayout>
  );
}
