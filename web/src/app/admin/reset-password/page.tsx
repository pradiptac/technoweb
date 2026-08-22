import { AuthLayout } from "@/components/layout/auth-layout";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { resetStaffPasswordAction } from "./actions";

export const metadata = buildMetadata({
  title: "Set a new staff password",
  path: "/admin/reset-password",
  seo: noIndex,
});

/**
 * The token and address arrive as query parameters on the emailed link and are
 * handed straight to the form as hidden fields, so a stale URL cannot end up
 * posting a token the page was not rendered for.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const [{ token, email }, settings] = await Promise.all([searchParams, getSiteSettings()]);

  return (
    <AuthLayout settings={settings} title="Choose a new password">
      <ResetPasswordForm
        action={resetStaffPasswordAction}
        token={token ?? ""}
        email={email ?? ""}
        signInHref="/admin/login"
        signInLabel="Go to staff login"
      />
    </AuthLayout>
  );
}
