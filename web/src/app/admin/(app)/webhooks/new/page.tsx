import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getWebhookEvents } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { WebhookForm } from "../webhook-form";
import type { WebhookEventOption } from "@/types/api";

export const metadata = buildMetadata({ title: "New webhook", path: "/admin/webhooks/new", seo: noIndex });

export default async function NewWebhookPage() {
  let events: WebhookEventOption[] = [];
  try {
    events = await getWebhookEvents();
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
        back={{ href: "/admin/webhooks", label: "All webhooks" }}
        title="New webhook"
        lede="The secret is minted when you save and shown once, on the next screen."
      />

      <WebhookForm events={events} />
    </>
  );
}
