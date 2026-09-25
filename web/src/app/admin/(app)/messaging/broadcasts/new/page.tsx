import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMessageBroadcastMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { BroadcastForm } from "../broadcast-form";
import type { MessageBroadcastMeta } from "@/types/api";

export const metadata = buildMetadata({ title: "New broadcast", path: "/admin/messaging/broadcasts/new", seo: noIndex });

export default async function NewBroadcastPage() {
  let meta: MessageBroadcastMeta;
  try {
    meta = await getMessageBroadcastMeta();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/messaging/broadcasts", label: "All broadcasts" }} title="New broadcast"
        lede="Saved as a draft; the next screen says how many it reaches and sends it." />
      <BroadcastForm meta={meta} />
    </>
  );
}
