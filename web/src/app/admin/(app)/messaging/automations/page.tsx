import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMessageAutomations } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { AutomationsForm } from "./automations-form";
import type { MessageAutomationCell, MessageAutomationMeta } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Automations", path: "/admin/messaging/automations", seo: noIndex });

export default async function AutomationsPage() {
  await requireScreen();
  let result: { data: MessageAutomationCell[]; meta: MessageAutomationMeta };
  try {
    result = await getMessageAutomations();
  } catch {
    return (
      <ErrorState title="We could not load the automations">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Automations"
        lede={<>
          Which template each event sends on each channel. The email for every event goes out as it
          always has; these are the other channels, and only to people who opted in on them.
          Promotional events wait for the quiet hours set in Messaging → Settings.
        </>}
      />
      <AutomationsForm cells={result.data} meta={result.meta} />
    </>
  );
}
