import { PageHeader } from "@/components/admin/page-header";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { getDetailTemplateOptions } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { DetailTemplateKind } from "@/types/api";
import { NewTemplateForm } from "./new-template-form";

export const metadata = buildMetadata({ title: "New detail template", path: "/admin/detail-templates/new", seo: noIndex });

/** `?type=` preselects the kind (the button on each kind's section on the list). */
export default async function NewDetailTemplatePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireScreen();
  const { type } = await searchParams;

  let kinds: DetailTemplateKind[];
  try {
    kinds = (await getDetailTemplateOptions()).detail_templates?.types ?? [];
  } catch {
    return (
      <ErrorState title="We could not load the kinds of page">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader
        back={{ href: "/admin/detail-templates", label: "All templates" }}
        title="New detail template"
        lede="Choose the kind of page and how to begin. Nothing changes on the site until the template is switched on."
      />
      {kinds.length === 0
        ? <EmptyState illustration="document" title="Nothing for your account to lay out" />
        : <NewTemplateForm kinds={kinds} initialType={kinds.some((k) => k.value === type) ? type : undefined} />}
    </>
  );
}
