"use client";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { deleteSubmissionAction } from "../../actions";

/**
 * Delete one submission.
 *
 * A one-press form with nothing typed into it, so it carries no state: the
 * action redirects with `?done=` and the toast says what happened. The
 * confirmation is the `window.confirm` the other delete buttons in the
 * console use, and it names what cannot be got back — the answers, and any
 * files that came with them, which live nowhere else.
 */
export function DeleteSubmission({
  formId, submissionId, page, perPage, files,
}: { formId: number; submissionId: number; page: number; perPage?: string; files: number }) {
  const what = files > 0
    ? `Delete submission #${submissionId} and the ${files === 1 ? "file" : `${files} files`} sent with it? This cannot be undone.`
    : `Delete submission #${submissionId}? This cannot be undone.`;

  return (
    <Form action={deleteSubmissionAction} className="ml-auto">
      <input type="hidden" name="form_id" value={formId} />
      <input type="hidden" name="submission_id" value={submissionId} />
      <input type="hidden" name="page" value={page} />
      {perPage && <input type="hidden" name="per_page" value={perPage} />}
      <Button
        type="submit" variant="ghost" size="sm" className="text-err"
        onClick={(e) => { if (!window.confirm(what)) e.preventDefault(); }}
      >
        Delete<span className="sr-only"> submission #{submissionId}</span>
      </Button>
    </Form>
  );
}
