import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { getChatConversations } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";

export const metadata = buildMetadata({ title: "Conversations", path: "/admin/chat/conversations", seo: noIndex });

type SearchParams = { q?: string; with_lead?: string; unanswered?: string; page?: string };

/**
 * Every conversation, newest first.
 *
 * The transcript is not in this list on purpose: two hundred conversations
 * carrying every message is a page nobody waits for, and the question a list
 * answers is "which one do I want", not "what did it say".
 */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const list = await getChatConversations({
    q: params.q,
    with_lead: params.with_lead === "1",
    unanswered: params.unanswered === "1",
    page: params.page ? Number(params.page) : undefined,
  }).catch(() => null);

  if (!list) {
    return (
      <ErrorState title="We could not load the conversations">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Conversations"
        lede="What visitors asked the assistant, and what it said back. Read-only — there is no way to edit a transcript and none to delete one; the retention prune removes them by age."
        back={{ href: "/admin/chat", label: "Website assistant" }}
      />

      <FilterBar action="/admin/chat/conversations">
        <FilterField label="Search what was said" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="firewall, hosting…" className="w-[220px]" />
        </FilterField>
        <FilterField label="Show" htmlFor="with_lead">
          <Select id="with_lead" name="with_lead" defaultValue={params.with_lead ?? ""} className="w-[170px]">
            <option value="">Everything</option>
            <option value="1">Produced a lead</option>
          </Select>
        </FilterField>
        <FilterField label="Answered" htmlFor="unanswered">
          <Select id="unanswered" name="unanswered" defaultValue={params.unanswered ?? ""} className="w-[190px]">
            <option value="">Everything</option>
            <option value="1">Something went unanswered</option>
          </Select>
        </FilterField>
        <Button type="submit" className="mb-[1px]">Show</Button>
      </FilterBar>

      {list.data.length === 0 ? (
        <EmptyState title="No conversations">
          Nobody has spoken to the assistant in this filter — or it is switched off in Settings.
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
            <table className="admin-table w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] text-faint">
                  <th className="py-2 pr-3 pl-4 font-semibold">Started</th>
                  <th className="py-2 pr-3 font-semibold">From</th>
                  <th className="py-2 pr-3 text-right font-semibold">Questions</th>
                  <th className="py-2 pr-4 font-semibold">Lead</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td data-label="Started" className="py-2 pr-3 pl-4 whitespace-nowrap">
                      <Link href={`/admin/chat/conversations/${row.id}`} className="hover:text-brand-ink">
                        {row.started_at
                          ? new Date(row.started_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                          : "—"}
                      </Link>
                    </td>
                    <td data-label="From" className="max-w-[34ch] truncate py-2 pr-3 font-mono text-[12.5px] text-muted">
                      {row.source_path ?? "—"}
                    </td>
                    <td data-label="Questions" className="py-2 pr-3 text-right tabular-nums">{row.questions}</td>
                    <td data-label="Lead" className="py-2 pr-4">
                      {row.lead ? (
                        <Link href={`/admin/leads/${row.lead.id}`} className="text-brand-ink hover:underline">
                          {row.lead.name ?? "Lead"}
                        </Link>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={list.meta} basePath="/admin/chat/conversations" params={{ ...params }} />
        </>
      )}
    </>
  );
}
