import { Form } from "@/components/ui/form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { IconPlug } from "@/components/icons";
import { formatTableDate, relativeTime } from "@/lib/dates";
import { redeliverAction } from "../actions";
import type { Paginated, WebhookDelivery, WebhookDeliveryStatus } from "@/types/api";

const STATUS_TONE: Record<WebhookDeliveryStatus, "progress" | "resolved" | "urgent"> = {
  pending: "progress", delivered: "resolved", failed: "urgent",
};

const STATUS_LABEL: Record<WebhookDeliveryStatus, string> = {
  pending: "Pending", delivered: "Delivered", failed: "Failed",
};

/**
 * The delivery log, newest first.
 *
 * A server component: the rows are read on the server and each Redeliver is
 * a one-press `<Form>` of its own, which is why this panel sits **outside**
 * the edit form's `<Form>` rather than inside one of its tabs — a form
 * inside a form is not a thing HTML can express, and the browser resolves
 * it by dropping the inner one silently.
 *
 * No payload here. The list carries event, status and the server's answer;
 * the payload is a screen of its own reached from the row, so fifty orders
 * are not fetched to draw fifty lines.
 */
export function DeliveriesPanel({
  webhookId, result, status,
}: {
  webhookId: number;
  result: Paginated<WebhookDelivery>;
  status?: string;
}) {
  const rows = result.data;
  const base = `/admin/webhooks/${webhookId}`;

  return (
    <section aria-labelledby="deliveries-heading">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="deliveries-heading" className="text-13-5 font-semibold">Deliveries</h2>
        <span className="text-12-5 text-muted">Newest first. Kept for thirty days.</span>
        <nav aria-label="Filter deliveries" className="ml-auto flex flex-wrap gap-1.5">
          {[["", "All"], ["pending", "Pending"], ["delivered", "Delivered"], ["failed", "Failed"]].map(([value, label]) => (
            <ButtonLink
              key={value}
              href={`${base}?tab=deliveries${value ? `&status=${value}` : ""}`}
              size="sm"
              variant={(status ?? "") === value ? "secondary" : "ghost"}
              aria-current={(status ?? "") === value ? "page" : undefined}
            >
              {label}
            </ButtonLink>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<IconPlug />} title={status ? `No ${status} deliveries` : "Nothing sent yet"}>
          {status
            ? "Nothing in the last thirty days with that status."
            : "Press Send a ping to prove the endpoint, or wait for the first event this hook is subscribed to."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Event</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Attempts</th>
                <th scope="col" className="px-3 py-1.5">Answer</th>
                <th scope="col" className="px-3 py-1.5">When</th>
                <th scope="col" className="px-3 py-1.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Event" className="px-3 py-2">
                    <span className="block text-13-5 font-medium text-ink">{d.event_label}</span>
                    <span className="font-mono text-11-5 text-faint">{d.event} · #{d.id}</span>
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                    {d.status === "pending" && d.next_attempt_at && (
                      <p className="mt-1 text-11-5 text-muted">Next try {relativeTime(d.next_attempt_at)}</p>
                    )}
                  </td>
                  <td data-label="Attempts" className="px-3 py-2 text-13 text-ink-2">{d.attempts}</td>
                  <td data-label="Answer" className="px-3 py-2">
                    {d.response_status !== null
                      ? <span className="font-mono text-12-5 text-ink-2">{d.response_status}</span>
                      : <span className="text-12-5 text-faint">—</span>}
                    {d.response_excerpt && (
                      <p className="mt-0.5 max-w-[40ch] truncate text-12 text-muted" title={d.response_excerpt}>
                        {d.response_excerpt}
                      </p>
                    )}
                  </td>
                  <td data-label="When" className="px-3 py-2 text-12-5 text-muted">
                    {formatTableDate(d.created_at)}
                    {d.delivered_at && <p className="mt-0.5 text-11-5 text-faint">Delivered {relativeTime(d.delivered_at)}</p>}
                  </td>
                  <td data-label="Actions" className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ButtonLink href={`${base}/deliveries/${d.id}`} size="sm" variant="ghost">Payload</ButtonLink>
                      <Form action={redeliverAction}>
                        <input type="hidden" name="id" value={webhookId} />
                        <input type="hidden" name="delivery" value={d.id} />
                        <Button type="submit" size="sm" variant="secondary">Redeliver</Button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        meta={result.meta}
        basePath={base}
        params={{ tab: "deliveries", status }}
      />
    </section>
  );
}
