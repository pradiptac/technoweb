import { AuthLayout } from "@/components/layout/auth-layout";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSiteSettings } from "@/lib/settings";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requestCustomerResetAction } from "./actions";
import { portalEnabled } from "@/lib/site-settings";
import { PortalClosed } from "@/components/portal/portal-closed";

export const metadata = buildMetadata({
  title: "Reset your password",
  path: "/portal/forgot-password",
  seo: noIndex,
});

export default async function Page() {
  const settings = await getSiteSettings();
  // The portal switched off (`portal_enabled`): one page for every door in.
  if (!portalEnabled(settings)) return <PortalClosed settings={settings} />;

  return (
    <AuthLayout settings={settings} title="Forgot your password?" lede="Enter the address you sign in with and we will email you a link to set a new one.">
      <ForgotPasswordForm
        action={requestCustomerResetAction}
        signInHref="/portal/login"
        signInLabel="Back to customer login"
      />
    </AuthLayout>
  );
}
