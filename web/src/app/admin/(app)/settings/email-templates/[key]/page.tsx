import { notFound } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getMailTemplate } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";
import { noIndex } from "@/lib/no-index";
import { TemplateEditor } from "./template-editor";
import { resetTemplateAction } from "../actions";
import type { MailTemplateDetail } from "@/types/api";

export const metadata = buildMetadata({
  title: "Edit email template",
  path: "/admin/settings/email-templates",
  seo: noIndex,
});

export default async function EditEmailTemplatePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  let result: MailTemplateDetail;

  try {
    result = await getMailTemplate(key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { data, meta } = result;

  return (
    <>
      <PageHeader
        title={meta.message.label}
        back={{ href: "/admin/settings/email-templates", label: "All templates" }}
        lede={meta.message.description}
      >
        <div className="ml-auto">
          {data.is_customised
            ? <Badge tone={data.is_enabled ? "resolved" : "open"}>
                {data.is_enabled ? "Customised" : "Customised, off"}
              </Badge>
            : <Badge tone="progress">Built in</Badge>}
        </div>
      </PageHeader>

      <TemplateEditor templateKey={key} template={data} message={meta.message} />

      {/*
        Outside the form above: a form inside another form is invalid markup,
        and browsers resolve it by dropping one of them.
      */}
      {data.is_customised && (
        <form action={resetTemplateAction} className="mt-10 border-t border-line pt-6">
          <input type="hidden" name="key" value={key} />
          <p className="measure mb-2 text-[13px] text-muted">
            Resetting discards your wording and puts the built-in message back. The
            built-in is what is being sent already whenever this is switched off, so
            nothing stops working either way.
          </p>
          <Button type="submit" variant="ghost" size="sm" className="text-err">
            Reset to the built-in message
          </Button>
        </form>
      )}
    </>
  );
}
