import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { getCurrentStaff } from "@/lib/admin-auth";
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

  return (
    // Its own <main> landmark: the login pages sit outside every route group
    // that supplies one, and the skip link targets #main.
    <main id="main">
      <Container className="flex min-h-[70vh] max-w-[440px] flex-col justify-center py-16">
      <Link href="/" className="mb-8 inline-block"><Logo /></Link>
      <h1 className="display-3">Staff login</h1>
      <p className="mt-2.5 text-[15px] text-muted">
        Sign in to the admin console to manage tickets and content.
      </p>

      <div className="mt-7 rounded-xl border border-line-strong bg-white p-6.5 shadow-1">
        <LoginForm />
      </div>
      </Container>
    </main>
  );
}
