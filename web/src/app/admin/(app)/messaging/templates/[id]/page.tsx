import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getMessageTemplate } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TemplateEditor } from "../template-editor";
import { deleteMessageTemplateAction } from "../../actions";
import type { MessageTemplate, MessageTemplateMeta } from "@/types/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return buildMetadata({ title: "Edit message template", path: `/admin/messaging/templates/${id}`, seo: noIndex });
}

export default async function EditMessageTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  let template: MessageTemplate;
  let meta: MessageTemplateMeta;
  try {
    ({ data: template, meta } = await getMessageTemplate(numericId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/messaging/templates", label: "All templates" }} title={template.name}>
        <Form action={deleteMessageTemplateAction} className="ml-auto">
          <input type="hidden" name="id" value={template.id} />
          <Button type="submit" size="sm" variant="destructive">Delete</Button>
        </Form>
      </PageHeader>
      <TemplateEditor template={template} meta={meta} />
    </>
  );
}
