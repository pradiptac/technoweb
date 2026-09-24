import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Tabs } from "@/components/admin/tabs";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getWebhook, getWebhookDeliveries, getWebhookEvents } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { WebhookForm } from "../webhook-form";
import { pingWebhookAction } from "../actions";
import { DeliveriesPanel } from "./deliveries-panel";
import type { AdminWebhook, Paginated, WebhookDelivery, WebhookEventOption } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit webhook", path: `/admin/webhooks/${id}`, seo: noIndex });
}

/**
 * The edit screen: the form on one tab, the delivery log on the other.
 *
 * The tabs sit *around* the form rather than inside it, because the log's
 * rows each carry a one-press Redeliver form of their own. `Tabs` keeps both
 * panels mounted, so switching to Deliveries loses nothing typed on Details;
 * `?tab=deliveries` is what Send a ping and Redeliver land on.
 */
export default async function EditWebhookPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string; per_page?: string }>;
}) {
  const { id } = await params;
  const { status, page, per_page } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let webhook: AdminWebhook;
  let events: WebhookEventOption[] = [];
  let deliveries: Paginated<WebhookDelivery>;
  try {
    [webhook, events, deliveries] = await Promise.all([
      getWebhook(numericId),
      getWebhookEvents(),
      getWebhookDeliveries(numericId, {
        status, page: Number(page) || 1, per_page: Number(per_page) || undefined,
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const failed = deliveries.data.filter((d) => d.status === "failed").length;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/webhooks", label: "All webhooks" }}
        title={webhook.name}
      >
        {!webhook.is_active && <Badge tone="closed">Switched off</Badge>}
        {webhook.last_error && <Badge tone="urgent">Last delivery failed</Badge>}
        <Form action={pingWebhookAction} className="ml-auto">
          <input type="hidden" name="id" value={webhook.id} />
          <Button type="submit" size="sm" variant="secondary">Send a ping</Button>
        </Form>
      </PageHeader>

      <Tabs
        tabs={[
          { id: "details", label: "Details" },
          { id: "deliveries", label: "Deliveries", badge: failed || undefined, tone: failed ? "err" : undefined },
        ]}
      >
        <WebhookForm webhook={webhook} events={events} />
        <DeliveriesPanel webhookId={webhook.id} result={deliveries} status={status} />
      </Tabs>
    </>
  );
}
