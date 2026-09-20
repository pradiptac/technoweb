import Link from "next/link";
import { landingFor } from "@/lib/admin-landing";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentStaffOrNull } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LoginForm } from "./login-form";

export const metadata = buildMetadata({
  title: "Staff login",
  description: "Sign in to the Technoware admin console.",
  path: "/admin/login",
  seo: noIndex,
});

export default async function AdminLoginPage() {
  // Already signed in — no reason to show the form again.
  // Same rule as signing in: an account whose role cannot reach the ticket
  // dashboard must not be sent to it.
  // `…OrNull`, so an unreachable API renders the form rather than a 500.
  const signedIn = await getCurrentStaffOrNull();
  if (signedIn) redirect(landingFor(signedIn.roles.map((r) => r.slug)));

  const settings = await getSiteSettings();

  return (
    <AuthLayout
      settings={settings}
      title="Staff login"
      lede="The admin console — tickets, content and site settings."
      footer={
        <>
          Looking for the customer portal?{" "}
          <Link href="/portal/login" className="font-semibold text-brand-ink hover:underline">
            Sign in there instead
          </Link>
          . Staff and customer accounts are entirely separate.
        </>
      }
    >
      {/*
        `settingEnabled` and not truthiness: settings come over the wire as
        strings, and "0" is truthy in JavaScript.
      */}
      <LoginForm
        otpEnabled={settingEnabled(settings, "otp_admin_login_enabled")}
        /* A string over the wire, so it is compared rather than coerced — the
           trap `settingEnabled` exists for, where "0" is truthy in JavaScript. */
        defaultMethod={settings.default_login_method === "password" ? "password" : "otp"}
        passwordEnabled={settingEnabled(settings, "password_login_enabled")}
      />
    </AuthLayout>
  );
}
