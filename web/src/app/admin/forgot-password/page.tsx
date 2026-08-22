import { AuthLayout } from "@/components/layout/auth-layout";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requestStaffResetAction } from "./actions";

export const metadata = buildMetadata({
  title: "Reset staff password",
  path: "/admin/forgot-password",
  seo: noIndex,
});

export default async function Page() {
  const settings = await getSiteSettings();

  return (
    <AuthLayout settings={settings} title="Forgot your password?" lede="Enter the address you sign in with and we will email you a link to set a new one.">
      <ForgotPasswordForm
        action={requestStaffResetAction}
        signInHref="/admin/login"
        signInLabel="Back to staff login"
      />
    </AuthLayout>
  );
}
