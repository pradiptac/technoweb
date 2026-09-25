import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/ui/empty";
import { getMessageTemplateMeta } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TemplateEditor } from "../template-editor";
import type { MessageTemplateMeta } from "@/types/api";

export const metadata = buildMetadata({ title: "New message template", path: "/admin/messaging/templates/new", seo: noIndex });

export default async function NewMessageTemplatePage() {
  let meta: MessageTemplateMeta;
  try {
    meta = await getMessageTemplateMeta();
  } catch {
    return (
      <ErrorState title="We could not open the editor">
        Messaging is for campaign and store managers. If that is your account, the admin API is not
        responding — try again shortly.
      </ErrorState>
    );
  }

  return (
    <>
      <PageHeader back={{ href: "/admin/messaging/templates", label: "All templates" }} title="New message template" />
      <TemplateEditor meta={meta} />
    </>
  );
}
