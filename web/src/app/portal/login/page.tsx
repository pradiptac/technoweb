import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomer } from "@/lib/auth";
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
  if (await getCurrentCustomer()) redirect("/portal");

  const settings = await getSiteSettings();
  const canRegister = settingEnabled(settings, "registration_enabled");

  return (
    <AuthLayout
      settings={settings}
      title="Customer login"
      lede="Raise a ticket, follow its progress and see your full support history."
      footer={
        /*
          The link is offered only when registration is actually open. With it
          closed the page falls back to the wording that was here before, which
          is still true: accounts are issued with the contract.
        */
        canRegister ? (
          <>
            No portal account yet?{" "}
            <Link href="/portal/register" className="font-semibold text-brand-ink hover:underline">
              Create one
            </Link>{" "}
            — we will activate it once we have checked your support agreement.
          </>
        ) : (
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
        passwordEnabled={settingEnabled(settings, "password_login_enabled")}
      />
    </AuthLayout>
  );
}
