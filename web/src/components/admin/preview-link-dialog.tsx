"use client";

import { useActionState, useCallback, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { CopyText } from "@/components/admin/copy-text";
import { previewLinkAction, type PreviewLinkState } from "@/components/admin/preview-link-actions";
import type { PreviewLink, PreviewType } from "@/types/api";

/** What the record is called in the sentences in the dialog. */
const NOUN: Record<PreviewType, string> = {
  page: "page",
  blog_post: "post",
  knowledge_article: "article",
  case_study: "case study",
  solution: "solution",
  service: "service",
  product: "product",
  store_product: "product",
  event: "event",
  job_opening: "vacancy",
  entry: "entry",
  landing_page: "landing page",
};

const DAYS_LABEL: Record<number, string> = { 1: "1 day", 7: "7 days", 30: "30 days" };

/** The browser's own origin, read without an effect: empty on the server, so nothing mismatches on hydration. */
const noopSubscribe = () => () => {};
const origin = () => window.location.origin;
const noOrigin = () => "";

/**
 * "Share preview" (0.138.0): a private link to a draft that anyone holding it
 * can open without signing in, until it expires or is revoked.
 *
 * **Refusals are shown inside the dialog.** It is a modal `<dialog>` in the
 * top layer and makes the rest of the document inert, so a toast raised
 * behind it would be neither seen nor reachable (the AI page draft's rule).
 *
 * **The address is built in the browser.** The API sends a path, because
 * `FRONTEND_URL` is the production domain on every machine and a link built on
 * it would send a reviewer from a development console to the live site.
 *
 * **One form, two submit buttons.** `intent` says which; the action answers
 * the record's link as it is *now* (`state.link`, `null` once revoked) so the
 * dialog updates without a re-render of the screen behind it — which would
 * throw away a half-written edit form.
 */
export function PreviewLinkDialog({
  type, id, initial, days, defaultDays, className,
}: {
  type: PreviewType;
  id: number;
  initial: PreviewLink | null;
  days: number[];
  defaultDays: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [state, action, pending] = useActionState<PreviewLinkState, FormData>(previewLinkAction, {});
  const formId = useId();
  const selectId = `${formId}-days`;
  const base = useSyncExternalStore(noopSubscribe, origin, noOrigin);

  const link = state.link !== undefined ? state.link : initial;
  const address = link ? `${base}${link.path}` : "";
  const noun = NOUN[type];

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={className}
        onClick={() => setOpen(true)}
        title={`Make a private link to this ${noun} that works without signing in`}
      >
        Share preview
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Share a preview"
        description={`A private link to this ${noun} for someone without an account — a client, a colleague — to read it before it is published.`}
        footer={<Button type="button" variant="ghost" size="sm" onClick={close}>Close</Button>}
      >
        {state.error && (
          <Alert tone="err" title="That did not work" dismissible={false}>{state.error}</Alert>
        )}

        {link && link.is_expired && (
          <Alert tone="warn" title="This link has expired" dismissible={false}>
            It stopped working on {link.expires_label}. Make a new one to share the {noun} again.
          </Alert>
        )}

        {link && !link.is_expired && (
          <div className="mb-4">
            <Field label="Preview link" htmlFor={`${formId}-address`} variant="above" className="mb-2">
              <Input
                id={`${formId}-address`}
                readOnly
                value={address}
                onFocus={(e) => e.currentTarget.select()}
                spellCheck={false}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <CopyText text={address} label="Copy link" what="The link" />
              <p className="text-12-5 text-muted">
                Expires {link.expires_label} · opened {link.views} {link.views === 1 ? "time" : "times"}
              </p>
            </div>
            <p className="measure mt-3 text-12-5 text-muted">
              Anyone who has this link can read the {noun} as it is saved now, signed out, until then. Search
              engines are told to ignore it.
            </p>
          </div>
        )}

        <Form id={formId} action={action} state={state}>
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          {link && <input type="hidden" name="link_id" value={link.id} />}

          <Field label="Link lasts" htmlFor={selectId} variant="float-static" className="mb-3">
            <Select id={selectId} name="days" defaultValue={String(defaultDays)}>
              {days.map((d) => <option key={d} value={d}>{DAYS_LABEL[d] ?? `${d} days`}</option>)}
            </Select>
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" name="intent" value="create" size="sm" pending={pending}>
              {link ? "Make a new link" : "Create link"}
            </Button>
            {link && (
              <Button type="submit" name="intent" value="revoke" size="sm" variant="secondary" disabled={pending}>
                Revoke link
              </Button>
            )}
          </div>

          {link && (
            <p className="measure mt-3 text-12-5 text-muted">
              Making a new link stops the old one working at once.
            </p>
          )}
        </Form>
      </Modal>
    </>
  );
}
