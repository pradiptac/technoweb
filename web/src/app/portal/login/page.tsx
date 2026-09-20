import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomerOrNull } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { LoginForm } from "./login-form";

export const metadata = buildMetadata({
  title: "Customer login",
  description: "Sign in to the Technoware support portal to raise and track tickets.",
  path: "/portal/login",
  seo: noIndex,
});

export default async function LoginPage() {
  // Already signed in — no reason to show the form again.
  // `…OrNull`, so an unreachable API renders the form rather than a 500.
  if (await getCurrentCustomerOrNull()) redirect("/portal");

  const settings = await getSiteSettings();
  const canRegister = settingEnabled(settings, "registration_enabled");

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
      <LoginForm
        otpEnabled={settingEnabled(settings, "otp_login_enabled")}
        /* A string over the wire, so it is compared rather than coerced — the
           trap `settingEnabled` exists for, where "0" is truthy in JavaScript. */
        defaultMethod={settings.default_login_method === "password" ? "password" : "otp"}
        passwordEnabled={settingEnabled(settings, "password_login_enabled")}
        canRegister={canRegister}
      />
    </AuthLayout>
  );
}
