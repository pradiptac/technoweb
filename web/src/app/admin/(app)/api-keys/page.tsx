import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconKey } from "@/components/icons";
import { getApiKeys } from "@/lib/admin";
import { formatTableDate } from "@/lib/dates";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";
import type { Paginated } from "@/types/api";
import type { AdminApiKey, ApiKeyStatus } from "@/types/api-keys";

export const metadata = buildMetadata({ title: "API keys", path: "/admin/api-keys", seo: noIndex });

const STATUS: Record<ApiKeyStatus, { tone: "resolved" | "progress" | "urgent"; label: string }> = {
  active: { tone: "resolved", label: "Active" },
  expired: { tone: "progress", label: "Expired" },
  revoked: { tone: "urgent", label: "Revoked" },
};

type SearchParams = { page?: string; per_page?: string };

export default async function AdminApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireScreen();
  const params = await searchParams;

  let result: Paginated<AdminApiKey>;
  try {
    result = await getApiKeys({ page: Number(params.page) || 1, per_page: Number(params.per_page) || undefined });
  } catch {
    return (
      <ErrorState title="We could not load the API keys">
        This screen is administrator-only. If that is your account, the admin
        API is not responding — try again shortly.
      </ErrorState>
    );
  }

  const keys = result.data;

  return (
    <>
      <PageHeader
        title="API keys"
        lede={<>
          A key lets another system read or add to this site&apos;s records, within
          the permissions you tick. It is shown once, when it is made, and only a
          fingerprint is kept — if it is lost, roll it.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/api-keys/new" size="sm">New API key</ButtonLink></div>
      </PageHeader>

      {keys.length === 0 ? (
        <EmptyState
          icon={<IconKey />}
          title="No API keys yet"
          action={<ButtonLink href="/admin/api-keys/new" size="sm">Make the first key</ButtonLink>}
        >
          Make one when a CRM, a spreadsheet or an automation needs to talk to this site.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[820px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Key</th>
                <th scope="col" className="px-3 py-1.5">Permissions</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Last used</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-line last:border-b-0 align-top">
                  <td data-label="Name" className="px-3 py-2">
                    <Link href={`/admin/api-keys/${k.id}`} className="block text-13-5 font-medium text-ink hover:underline">
                      {k.name}
                    </Link>
                  </td>
                  <td data-label="Key" className="px-3 py-2 font-mono text-12-5 text-ink-2">{k.prefix}…</td>
                  <td data-label="Permissions" className="px-3 py-2">
                    <ul className="flex max-w-[44ch] flex-wrap gap-1">
                      {k.scope_labels.map((label) => (
                        <li key={label}><Badge dot={false}>{label}</Badge></li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={STATUS[k.status].tone}>{STATUS[k.status].label}</Badge>
                  </td>
                  <td data-label="Last used" className="px-3 py-2 text-12-5 text-muted">
                    {formatTableDate(k.last_used_at, "Never")}
                    {typeof k.requests_30d === "number" && (
                      <p className="mt-0.5 text-11-5 text-faint">{k.requests_30d} {k.requests_30d === 1 ? "request" : "requests"} in 30 days</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/api-keys" params={{ per_page: params.per_page }} />
    </>
  );
}
