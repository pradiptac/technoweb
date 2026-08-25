import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomer } from "@/lib/auth";
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
  if (await getCurrentCustomer()) redirect("/portal");

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
      lede="Register once, then raise and track tickets without picking up the phone."
      footer={
        <>
          Accounts are reviewed before they go live — see{" "}
          <Link href="/privacy" className="font-semibold text-brand-ink hover:underline">
            how we handle your details
          </Link>
          .
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
