import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/layout/auth-layout";
import { getCurrentStaff } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/settings";
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
  if (await getCurrentStaff()) redirect("/admin");

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
      <LoginForm />
    </AuthLayout>
  );
}
