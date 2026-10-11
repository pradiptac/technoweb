import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty";
import { ApiError } from "@/lib/api";
import { getDetailTemplate, getDetailTemplateOptions, getTemplateRecords } from "@/lib/admin";
import { requireScreen } from "@/lib/admin-screen";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import type { AdminDetailTemplate, PageBuilderOptions } from "@/types/api";
import { TemplateEditor } from "./template-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit detail template", path: `/admin/detail-templates/${id}`, seo: noIndex });
}

export default async function EditDetailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen();
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let template: AdminDetailTemplate;
  let options: PageBuilderOptions;
  try {
    [template, options] = await Promise.all([getDetailTemplate(numericId), getDetailTemplateOptions()]);
  } catch (error) {
    // A kind this account does not own is the API's 403: to this account, the page is not there.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    return (
      <ErrorState title="We could not load the template">
        The admin API is not responding. Try again shortly.
      </ErrorState>
    );
  }

  const kind = options.detail_templates?.types.find((t) => t.value === template.type);
  if (!kind) notFound();

  // The first fifty of the kind, for the preview's picker; it searches for the rest.
  const records = await getTemplateRecords(template.type).catch(() => []);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/detail-templates", label: "All templates" }}
        title="Edit detail template"
        lede={`How every ${kind.noun} page is laid out while this template is switched on. The parts of the page itself are drawn from each ${kind.noun}; the sections are yours.`}
      >
        <Badge tone="progress">{kind.label}</Badge>
        <Badge tone={template.is_active ? "resolved" : "closed"}>{template.is_active ? "Active" : "Off"}</Badge>
      </PageHeader>
      <TemplateEditor template={template} options={options} kind={kind} records={records} />
    </>
  );
}
