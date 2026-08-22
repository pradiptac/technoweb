import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
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

  return (
    <AuthLayout
      settings={settings}
      title="Customer login"
      lede="Raise a ticket, follow its progress and see your full support history."
      footer={
        <>
          No portal account yet?{" "}
          <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
            Ask your account engineer
          </Link>{" "}
          — logins are issued with your AMC contract.
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
