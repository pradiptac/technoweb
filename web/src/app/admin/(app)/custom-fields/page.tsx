import Link from "next/link";
import { PageHeader, FilterBar, FilterField } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { IconLayers } from "@/components/icons";
import { getCustomFieldGroupList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Custom fields", path: "/admin/custom-fields", seo: noIndex });

export default async function CustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; target?: string; page?: string; per_page?: string }>;
}) {
  await requireScreen();
  const params = await searchParams;

  let result: Awaited<ReturnType<typeof getCustomFieldGroupList>>;
  try {
    result = await getCustomFieldGroupList({
      q: params.q,
      target: params.target,
      page: Number(params.page) || 1,
      per_page: Number(params.per_page) || undefined,
    });
  } catch {
    return (
      <ErrorState title="We could not load the custom fields">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        title="Custom fields"
        lede={<>
          Extra fields for the content you already have — a warranty on a product, a go-live
          date on a case study. A group of fields is attached to one or more kinds of record,
          and every record of that kind gains a Fields tab holding them.
        </>}
      >
        <div className="ml-auto"><ButtonLink href="/admin/custom-fields/new" size="sm">New field group</ButtonLink></div>
      </PageHeader>

      <FilterBar action="/admin/custom-fields">
        <FilterField label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name…" />
        </FilterField>
        <FilterField label="Attached to" htmlFor="target">
          <Select id="target" name="target" defaultValue={params.target ?? ""}>
            <option value="">Anything</option>
            {result.meta.targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FilterField>
        <ButtonLink href="/admin/custom-fields" variant="ghost" size="sm">Clear</ButtonLink>
      </FilterBar>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No field groups yet">
          Create one, choose which kinds of record it belongs to, and add its fields.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[620px] text-13-5">
            <thead>
              <tr className="border-b border-line-strong text-left text-11-5 uppercase tracking-[.06em] text-faint">
                <th className="py-2.5 font-semibold">Name</th>
                <th className="py-2.5 font-semibold">Attached to</th>
                <th className="py-2.5 font-semibold">Fields</th>
                <th className="py-2.5 font-semibold">On the page</th>
                <th className="py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((group) => (
                <tr key={group.id} className="border-b border-line last:border-b-0">
                  <td data-label="Name" className="py-2.5">
                    <Link href={`/admin/custom-fields/${group.id}`} className="font-semibold text-brand-ink hover:underline">
                      {group.name}
                    </Link>
                  </td>
                  <td data-label="Attached to" className="py-2.5 text-muted">{group.target_labels.join(", ")}</td>
                  <td data-label="Fields" className="py-2.5">{group.fields_count ?? 0}</td>
                  <td data-label="On the page" className="py-2.5">{group.placement === "details" ? "Drawn" : "Data only"}</td>
                  <td data-label="Status" className="py-2.5">
                    <Badge tone={group.is_active ? "resolved" : "closed"}>{group.is_active ? "On" : "Off"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={result.meta} basePath="/admin/custom-fields"
        params={{ q: params.q, target: params.target, per_page: params.per_page }} />
    </>
  );
}
