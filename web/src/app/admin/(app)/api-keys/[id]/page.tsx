import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Tabs } from "@/components/admin/tabs";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { getApiKey, getApiKeyMeta, getApiKeyRequests } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import { ApiKeyForm } from "../api-key-form";
import { KeyActions } from "../key-actions";
import { RequestLog } from "../request-log";
import type { Paginated } from "@/types/api";
import type { AdminApiKey, ApiKeyDayCount, ApiKeyRequestRow } from "@/types/api-keys";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit API key", path: `/admin/api-keys/${id}`, seo: noIndex });
}

const STATUS = {
  active: { tone: "resolved", label: "Active" },
  expired: { tone: "progress", label: "Expired" },
  revoked: { tone: "urgent", label: "Revoked" },
} as const;

/**
 * The edit screen: the form on one tab, the request log on the other.
 *
 * The tabs sit *around* the form, as the webhook screen's do, so the log's
 * filter links are ordinary links and `Tabs` keeps both panels mounted.
 * `?tab=requests` is where the filter and the pager land.
 */
export default async function EditApiKeyPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const { id } = await params;
  const { status, page, per_page } = await searchParams;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let key: AdminApiKey;
  let meta: Awaited<ReturnType<typeof getApiKeyMeta>>;
  let log: Paginated<ApiKeyRequestRow> & { meta: { counts: ApiKeyDayCount[] } };
  try {
    [key, meta, log] = await Promise.all([
      getApiKey(numericId),
      getApiKeyMeta(),
      getApiKeyRequests(numericId, { status, page: Number(page) || 1, per_page: Number(per_page) || undefined }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const state = STATUS[key.status];

  return (
    <>
      <PageHeader back={{ href: "/admin/api-keys", label: "All API keys" }} title={key.name}>
        <Badge tone={state.tone}>{state.label}</Badge>
        <span className="font-mono text-12-5 text-muted">{key.prefix}…</span>
        <span className="ml-auto text-12-5 text-muted">
          {key.last_used_at
            ? `Last used ${formatDate(key.last_used_at, "dateTime")}${key.last_used_ip ? ` from ${key.last_used_ip}` : ""}`
            : "Never used"}
          {key.created_by ? ` · made by ${key.created_by}` : ""}
        </span>
      </PageHeader>

      <KeyActions id={key.id} name={key.name} revoked={key.status === "revoked"} baseUrl={meta.base_url} />

      <Tabs
        tabs={[
          { id: "details", label: "Details" },
          { id: "requests", label: "Requests" },
        ]}
      >
        <ApiKeyForm apiKey={key} scopes={meta.scopes} baseUrl={meta.base_url} />
        <RequestLog keyId={key.id} result={log} counts={log.meta.counts} status={status} />
      </Tabs>
    </>
  );
}
