import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getDetailTemplateOptions, getDetailTemplates } from "@/lib/admin";
import { formatDate } from "@/lib/dates";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminDetailTemplate, DetailTemplateKind } from "@/types/api";

export const metadata = buildMetadata({ title: "Detail templates", path: "/admin/detail-templates", seo: noIndex });

/**
 * Detail templates (0.161.0, docs/page-builder.md "Detail templates"): how every
 * page of one kind of record is laid out. One section per kind this account may
 * lay out — the API decides which (a content manager's are not a store
 * manager's) — saying which template the pages use now: the active one, or the
 * layout they have in code.
 */
export default async function DetailTemplatesPage() {
  await requireScreen();

  let kinds: DetailTemplateKind[];
  let templates: AdminDetailTemplate[];
  try {
    const [options, list] = await Promise.all([getDetailTemplateOptions(), getDetailTemplates({ per_page: 100 })]);
    kinds = options.detail_templates?.types ?? [];
    templates = list.data;
  } catch {
    return (
      <ErrorState title="We could not load the templates">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Detail templates"
        lede="How every page of one kind of record is laid out. Build a template once from sections and the parts of the page itself — its heading, body, specification, buy panel — and switch it on; every page of that kind follows it. With none switched on, a page keeps the layout it has today."
      />

      {kinds.length === 0 ? (
        <EmptyState illustration="document" title="Nothing for your account to lay out">
          Detail templates are kept by the people who own each kind of page: content managers for the catalogue and the blog, store managers for the shop.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          {kinds.map((kind) => (
            <KindSection key={kind.value} kind={kind} templates={templates.filter((t) => t.type === kind.value)} />
          ))}
        </div>
      )}
    </>
  );
}

function KindSection({ kind, templates }: { kind: DetailTemplateKind; templates: AdminDetailTemplate[] }) {
  const active = templates.find((t) => t.is_active);

  return (
    <section data-detail-kind={kind.value} aria-labelledby={`kind-${kind.value}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`kind-${kind.value}`} className="text-15 font-semibold">{kind.label}</h2>
        <span className="text-13 text-muted">
          {active ? <>Using <strong className="font-semibold text-ink">{active.name}</strong></> : "Using the layout the page has today"}
        </span>
        <span className="ml-auto">
          <ButtonLink href={`/admin/detail-templates/new?type=${kind.value}`} size="sm" variant="secondary">
            New {kind.noun} template
          </ButtonLink>
        </span>
      </div>

      {templates.length === 0 ? (
        <p className="text-13 text-muted">No template yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card">
          <table className="admin-table w-full min-w-[560px] text-left text-13">
            <thead>
              <tr className="border-b border-line-strong text-10-5 font-semibold uppercase tracking-[.06em] text-faint">
                <th scope="col" className="px-3 py-1.5">Name</th>
                <th scope="col" className="px-3 py-1.5">Status</th>
                <th scope="col" className="px-3 py-1.5">Sections</th>
                <th scope="col" className="px-3 py-1.5">Saved by</th>
                <th scope="col" className="px-3 py-1.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-line align-top last:border-b-0">
                  <td data-label="Name" className="px-3 py-2">
                    <Link href={`/admin/detail-templates/${t.id}`} className="block text-13-5 font-medium text-ink hover:underline">{t.name}</Link>
                  </td>
                  <td data-label="Status" className="px-3 py-2">
                    <Badge tone={t.is_active ? "resolved" : "closed"}>{t.is_active ? "Active" : "Off"}</Badge>
                  </td>
                  <td data-label="Sections" className="px-3 py-2 text-muted">{t.count}</td>
                  <td data-label="Saved by" className="px-3 py-2 text-muted">{t.author ?? "—"}</td>
                  <td data-label="Updated" className="px-3 py-2 text-muted">{t.updated_at ? formatDate(t.updated_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
