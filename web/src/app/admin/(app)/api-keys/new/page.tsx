import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getApiKeyMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { ApiKeyForm } from "../api-key-form";

export const metadata = buildMetadata({ title: "New API key", path: "/admin/api-keys/new", seo: noIndex });

export default async function NewApiKeyPage() {
  await requireScreen();
  let meta: Awaited<ReturnType<typeof getApiKeyMeta>>;
  try {
    meta = await getApiKeyMeta();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/api-keys", label: "All API keys" }}
        title="New API key"
        lede="The key is made when you save and shown once, on the next screen."
      />

      <ApiKeyForm scopes={meta.scopes} baseUrl={meta.base_url} />
    </>
  );
}
