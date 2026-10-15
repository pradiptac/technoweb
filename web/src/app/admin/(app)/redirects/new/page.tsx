import { PageHeader } from "@/components/admin/page-header";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { RedirectForm } from "../redirect-form";
import { requireScreen } from "@/lib/admin-screen";

export const metadata = buildMetadata({ title: "New redirect", path: "/admin/redirects/new", seo: noIndex });

/**
 * `?from=` is the "Make a redirect" link on Missing pages: the address that
 * 404ed, as the starting value of "Redirect from". Read once, and only when it
 * is a path on this site — `//host` would be another site's address in a field
 * whose whole meaning is "a path here".
 */
export default async function NewRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  await requireScreen();
  const { from } = await searchParams;
  const initialFrom = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/redirects", label: "All redirects" }}
        title="New redirect"
      />

      <RedirectForm initialFrom={initialFrom} />
    </>
  );
}
