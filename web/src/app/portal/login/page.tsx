import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { getCurrentCustomer } from "@/lib/auth";
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

  return (
    // Its own <main> landmark: the login pages sit outside every route group
    // that supplies one, and the skip link targets #main.
    <main id="main">
      <Container className="flex min-h-[70vh] max-w-[440px] flex-col justify-center py-16">
      <Link href="/" className="mb-8 inline-block"><Logo /></Link>
      <h1 className="display-3">Customer login</h1>
      <p className="mt-2.5 text-[15px] text-muted">
        Raise a ticket, follow its progress and see your full support history.
      </p>

      <div className="mt-7 rounded-xl border border-line-strong bg-white p-6.5 shadow-1">
        <LoginForm />
      </div>

      <p className="mt-6 text-sm text-muted">
        No portal account yet?{" "}
        <Link href="/contact" className="font-semibold text-brand-600 hover:underline">
          Ask your account engineer
        </Link>{" "}
        — logins are issued with your AMC contract.
      </p>
      </Container>
    </main>
  );
}
