import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomerOrNull } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { settingEnabled } from "@/lib/site-settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { RegisterForm } from "./register-form";

export const metadata = buildMetadata({
  title: "Create a support account",
  description: "Register for the Technoware support portal to raise and track tickets.",
  path: "/portal/register",
  seo: noIndex,
});

export default async function RegisterPage() {
  // `…OrNull`, for the reason the sign-in page uses it.
  if (await getCurrentCustomerOrNull()) redirect("/portal");

  const settings = await getSiteSettings();

  /*
    A 404 rather than a "registration is closed" page.

    With the setting off this route does not exist as far as the site is
    concerned: the login page stops linking to it, and a page explaining that
    a feature is disabled is a page that has to be designed, translated and
    kept accurate for a state nobody is in. The API refuses the POST as well,
    so a stale tab cannot get around it.
  */
  if (!settingEnabled(settings, "registration_enabled")) notFound();

  return (
    <AuthLayout
      settings={settings}
      title="Create a support account"
      lede="Register once, then raise tickets and place store orders without picking up the phone."
      footer={
        /*
          Whether this is true depends on `customer_approval_required` — a
          claim this footer used to make unconditionally, which stopped being
          accurate the moment that setting could be switched off. Both
          branches keep the privacy link; only the sentence in front of it
          changes.
        */
        settingEnabled(settings, "customer_approval_required", false) ? (
          <>
            Accounts are reviewed before they go live — see{" "}
            <Link href="/privacy" className="font-semibold text-brand-ink hover:underline">
              how we handle your details
            </Link>
            .
          </>
        ) : (
          <>
            Confirm your email address and you are straight in — see{" "}
            <Link href="/privacy" className="font-semibold text-brand-ink hover:underline">
              how we handle your details
            </Link>
            .
          </>
        )
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
