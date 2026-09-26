import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getWebhookDelivery } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { redeliverAction } from "../../../actions";
import type { WebhookDelivery } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export async function generateMetadata({ params }: { params: Promise<{ id: string; delivery: string }> }) {
  const { id, delivery } = await params;
  return buildMetadata({ title: "Webhook delivery", path: `/admin/webhooks/${id}/deliveries/${delivery}`, seo: noIndex });
}

/**
 * One delivery, with the payload that was sent.
 *
 * The only screen that shows a payload, and the one place the exact bytes
 * can be compared against what the other end says it received. The JSON
 * shown is the `data` half of the envelope: the `id`, `event` and
 * `created_at` around it are the same fields drawn above.
 */
export default async function WebhookDeliveryPage({
  params,
}: {
  params: Promise<{ id: string; delivery: string }>;
}) {
  await requireScreen();
  const { id, delivery: deliveryId } = await params;
  const webhookId = Number(id);
  const numericId = Number(deliveryId);
  if (!Number.isInteger(webhookId) || !Number.isInteger(numericId)) notFound();

  let delivery: WebhookDelivery;
  try {
    delivery = await getWebhookDelivery(webhookId, numericId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const tone = delivery.status === "delivered" ? "resolved" : delivery.status === "failed" ? "urgent" : "progress";

  return (
    <>
      <PageHeader
        back={{ href: `/admin/webhooks/${webhookId}?tab=deliveries`, label: "All deliveries" }}
        title={`${delivery.event_label} · #${delivery.id}`}
      >
        <Badge tone={tone}>{delivery.status}</Badge>
        <Form action={redeliverAction} className="ml-auto">
          <input type="hidden" name="id" value={webhookId} />
          <input type="hidden" name="delivery" value={delivery.id} />
          <Button type="submit" size="sm" variant="secondary">Redeliver</Button>
        </Form>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card interactive={false} as="section" padding="sm">
          <dl className="grid gap-2 text-13">
            <div><dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Event</dt><dd className="font-mono text-12-5">{delivery.event}</dd></div>
            <div><dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Attempts</dt><dd>{delivery.attempts}</dd></div>
            <div>
              <dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Server answered</dt>
              <dd className="font-mono text-12-5">{delivery.response_status ?? "—"}</dd>
            </div>
            <div><dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Created</dt><dd>{formatDate(delivery.created_at, "dateTime")}</dd></div>
            <div><dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Delivered</dt><dd>{formatDate(delivery.delivered_at, "dateTime", "Not yet")}</dd></div>
            <div><dt className="text-11 font-semibold uppercase tracking-[.06em] text-faint">Next attempt</dt><dd>{formatDate(delivery.next_attempt_at, "dateTime", "None scheduled")}</dd></div>
          </dl>
          {delivery.response_excerpt && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1 text-11 font-semibold uppercase tracking-[.06em] text-faint">What came back</p>
              <pre className="w-0 min-w-full overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-12 text-ink-2">{delivery.response_excerpt}</pre>
            </div>
          )}
        </Card>

        <Card interactive={false} as="section" padding="sm" className="min-w-0">
          <p className="mb-2 text-11 font-semibold uppercase tracking-[.06em] text-faint">Payload — the <code className="font-mono">data</code> of the envelope</p>
          <pre className="w-0 min-w-full overflow-x-auto font-mono text-12 leading-[1.5] text-ink-2">
            {JSON.stringify(delivery.payload ?? {}, null, 2)}
          </pre>
        </Card>
      </div>
    </>
  );
}
