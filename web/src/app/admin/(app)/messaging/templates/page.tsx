import Link from "next/link";
import { PageHeader, FilterBar } from "@/components/admin/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconPen } from "@/components/icons";
import { getMessageTemplates } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { approvalTone } from "../tones";
import { SyncButton } from "./sync-button";
import type { MessageTemplate, MessageTemplateMeta, Paginated } from "@/types/api";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Message templates", path: "/admin/messaging/templates", seo: noIndex });

type SearchParams = { channel?: string; q?: string; page?: string; per_page?: string };

export default async function MessageTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireScreen();
  const params = await searchParams;

  let result: Paginated<MessageTemplate> & { meta: MessageTemplateMeta };
  try {
    result = await getMessageTemplates({
      channel: params.channel, q: params.q, page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the templates">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  const filtered = Boolean(params.channel || params.q);
  const approving = result.meta.channels.filter((c) => c.needs_approval && c.ready);

  return (
    <>
      <PageHeader
        title="Message templates"
        lede={<>
          What is said on WhatsApp, RCS and browser push. A WhatsApp template is reviewed by
          WhatsApp before anything is sent against it; RCS and push need no approval.
          Automations choose which template each event uses.
        </>}
      >
        <div className="ml-auto flex flex-wrap gap-2">
          {approving.map((c) => <SyncButton key={c.value} channel={c.value} label={c.label} />)}
          <ButtonLink href="/admin/messaging/templates/new" size="sm">New template</ButtonLink>
        </div>
      </PageHeader>

      <FilterBar action="/admin/messaging/templates">
        <div>
          <label htmlFor="channel" className="mb-0.5 block text-11 font-semibold text-faint">Channel</label>
          <Select id="channel" name="channel" defaultValue={params.channel ?? ""}>
            <option value="">Any</option>
            {result.meta.channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="q" className="mb-0.5 block text-11 font-semibold text-faint">Search</label>
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Name or key" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Apply</Button>
          {filtered && <ButtonLink href="/admin/messaging/templates" variant="ghost" size="sm">Clear</ButtonLink>}
        </div>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconPen />} title={filtered ? "No templates match that filter" : "No templates yet"}>
          {filtered ? "Clear the filter to see the rest." : "Write one for each thing you want to say — an order update, a basket reminder — then switch it on under Automations."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[720px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Template</th>
                <th scope="col" className="px-3 py-1.5">Channel</th>
                <th scope="col" className="px-3 py-1.5">Approval</th>
                <th scope="col" className="px-3 py-1.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((t) => (
                <tr key={t.id} className="border-b border-line align-top last:border-b-0">
                  <td data-label="Template" className="px-3 py-2">
                    <Link href={`/admin/messaging/templates/${t.id}`} className="block hover:underline">
                      <span className="text-13-5 font-medium text-ink">{t.name}</span>
                    </Link>
                    <p className="mt-0.5 max-w-[46ch] truncate text-12 text-muted" title={t.body}>{t.body}</p>
                  </td>
                  <td data-label="Channel" className="px-3 py-2 text-13 text-ink-2">{t.channel_label}</td>
                  <td data-label="Approval" className="px-3 py-2">
                    <Badge tone={approvalTone(t.approval_status)}>{t.approval_label}</Badge>
                    {t.approval_reason && <p className="mt-0.5 max-w-[36ch] truncate text-12 text-faint" title={t.approval_reason}>{t.approval_reason}</p>}
                  </td>
                  <td data-label="Updated" className="px-3 py-2 text-12-5 text-muted">{t.updated_at ? formatTableDate(t.updated_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/messaging/templates" params={{ channel: params.channel, q: params.q, per_page: params.per_page }} />
    </>
  );
}
