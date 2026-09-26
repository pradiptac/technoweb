import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { IconGrid } from "@/components/icons";
import { getContentTypeList } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "Custom content", path: "/admin/content", seo: noIndex });

/**
 * Every content type, as a way in to its entries.
 *
 * One sidebar row for all of them rather than a row per type: the types are
 * data, and a sidebar whose rows an editor can multiply is one `screenRole()`
 * would need a rule per row for. `/admin/content/{type}` resolves to this
 * row by the longest-match rule, so every entry screen keeps its role gate.
 */
export default async function CustomContentPage() {
  await requireScreen();
  let result: Awaited<ReturnType<typeof getContentTypeList>>;
  try {
    result = await getContentTypeList({ per_page: 100 });
  } catch {
    return (
      <ErrorState title="We could not load the content types">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader title="Custom content">
        <div className="ml-auto"><ButtonLink href="/admin/content-types" size="sm" variant="secondary">Manage types</ButtonLink></div>
      </PageHeader>

      {result.data.length === 0 ? (
        <EmptyState icon={<IconGrid />} title="No content types yet"
          action={<ButtonLink href="/admin/content-types/new" size="sm">New content type</ButtonLink>}>
          A content type — events, downloads, partners — gives its entries an address and an archive.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.data.map((type) => (
            <li key={type.id}>
              <Card as="div" interactive={false} padding="md">
                <h2 className="text-15 font-semibold">
                  <Link href={`/admin/content/${type.slug}`} className="text-brand-ink hover:underline">{type.plural}</Link>
                </h2>
                <p className="mt-1 font-mono text-12-5 text-muted">{type.path}</p>
                <p className="mt-2 text-13 text-muted">
                  {type.published_count ?? 0} published of {type.entries_count ?? 0}
                  {!type.is_active && " · switched off"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href={`/admin/content/${type.slug}/new`} size="sm">New {type.name.toLowerCase()}</ButtonLink>
                  <ButtonLink href={`/admin/content/${type.slug}`} size="sm" variant="ghost">All entries</ButtonLink>
                  {type.is_active && type.archive_enabled && (
                    <ButtonLink href={type.path} size="sm" variant="ghost">View on site</ButtonLink>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
