"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { cn } from "@/lib/utils";
import {
  previewTemplateAction,
  saveTemplateAction,
  sendTestAction,
  type TemplateState,
} from "../actions";
import type { MailTemplateDetail, MailTemplateMessage } from "@/types/api";

/*
 * `ssr: false` is required rather than preferred, and the 500 it causes says
 * nothing useful: "self is not defined", from deep inside a Turbopack chunk.
 * Summernote and jQuery both touch `document` when their modules are
 * evaluated, so a static import of the editor throws during server rendering
 * — `editor-field.tsx` carries the same note for the same reason.
 *
 * `EditorField` would have given this for free, and cannot be used here: it
 * holds its HTML in its own state and exposes no `onChange`, so the live
 * preview beside it could never see what was typed.
 */
const RichTextEditor = dynamic(
  () => import("@/components/admin/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[320px] rounded border border-line-strong bg-card p-4 text-[15px] text-muted">
        Loading editor…
      </div>
    ),
  },
);

const initial: TemplateState = {};

export function TemplateEditor({
  templateKey, template, message,
}: {
  templateKey: string;
  template: MailTemplateDetail["data"];
  message: MailTemplateMessage;
}) {
  const [state, formAction, pending] = useActionState(
    saveTemplateAction.bind(null, templateKey),
    initial,
  );

  const [subject, setSubject] = useState(template.subject);
  const [html, setHtml] = useState(template.body_html);
  const [text, setText] = useState(template.body_text ?? "");
  const [enabled, setEnabled] = useState(template.is_enabled);

  const [preview, setPreview] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [test, setTest] = useState<TemplateState>({});
  const [sending, setSending] = useState(false);

  /*
    The live preview, rendered by the API through the same method a real send
    uses — so this is the email, not an approximation of it.

    400ms of quiet, and a `ticket` so the last request wins: a slow render for
    one keystroke must not land after a fast one for the next and paint a
    preview of something already typed over.
  */
  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;

    const timer = window.setTimeout(async () => {
      const result = await previewTemplateAction(templateKey, {
        subject, body_html: html, body_text: text || null,
      });

      if (mine === ticket.current && result) setPreview(result.html);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [templateKey, subject, html, text]);

  async function onTest() {
    setSending(true);
    setTest(await sendTestAction(templateKey, { subject, body_html: html, body_text: text || null }));
    setSending(false);
  }

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && <Alert tone="ok" title="Saved">{state.ok}</Alert>}
      {/* Survives the save deliberately: the copy is stored, and these names
          are the ones that will be dropped when the email goes out. */}
      {state.warn && <Alert tone="warn" title="Some placeholders will be removed">{state.warn}</Alert>}
      {test.ok && <Alert tone="ok" title="Test sent">{test.ok}</Alert>}
      {test.error && <Alert tone="err" title="The test did not send">{test.error}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
          <Field
            label="Subject"
            htmlFor="subject"
            hint="Placeholders work here too. A line break is refused — it would be a mail header."
          >
            <Input
              id="subject" name="subject" required maxLength={200}
              value={subject} onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <div className="mb-[18px]">
            <label className="mb-1.5 block text-[13px] font-semibold" htmlFor="body_html">Body</label>
            <p className="measure mb-2 text-[12.5px] text-muted">
              Just the message. The logo, colours, footer and address are added around it.
            </p>
            <RichTextEditor id="body_html" value={html} onChange={setHtml} />
            {/* The editor holds its HTML in state so the preview can see it;
                this is what keeps the `<Form>` posting a value. */}
            <input type="hidden" name="body_html" value={html} />
          </div>

          <Field
            label="Plain text version"
            htmlFor="body_text"
            hint="Leave blank and it is worked out from the body above, keeping the paragraphs and the links. Some mail clients only ever show this."
          >
            <Textarea
              id="body_text" name="body_text" rows={5}
              value={text} onChange={(e) => setText(e.target.value)}
            />
          </Field>

          <label className="mb-6 flex items-center gap-2.5 text-[13.5px]">
            <input
              type="checkbox" name="is_enabled" className="size-4 accent-brand-600"
              checked={enabled} onChange={(e) => setEnabled(e.target.checked)}
            />
            Use this wording
            <span className="text-muted">
              — switch it off to go back to the built-in message without losing what you have written.
            </span>
          </label>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-16">
          <VariablePalette variables={message.variables} />

          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="admin-title text-[15px]">Preview</h2>
              <div className="ml-auto flex gap-1">
                <button
                  type="button" onClick={() => setNarrow(false)} aria-pressed={!narrow}
                  className={cn("rounded border border-line-strong px-2 py-1 text-[12px]", !narrow && "bg-surface-2")}
                >
                  Desktop
                </button>
                <button
                  type="button" onClick={() => setNarrow(true)} aria-pressed={narrow}
                  className={cn("rounded border border-line-strong px-2 py-1 text-[12px]", narrow && "bg-surface-2")}
                >
                  Phone
                </button>
              </div>
            </div>

            {/*
              `sandbox` with nothing granted. The preview is a whole document
              with its own `<style>`, which would otherwise leak into the
              console's own stylesheet.
            */}
            <iframe
              title="Email preview"
              srcDoc={preview}
              sandbox=""
              className={cn(
                "h-[520px] w-full rounded-lg border border-line-strong bg-card",
                narrow && "max-w-[380px]",
              )}
            />
          </div>
        </aside>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save wording"}</Button>
        <Button type="button" variant="secondary" onClick={onTest} disabled={sending}>
          {sending ? "Sending…" : "Send test"}
        </Button>
      </FormActions>
    </Form>
  );
}

/**
 * The names this message offers, click to copy.
 *
 * Built from what the API sent — the catalogue owns these, and a hand-written
 * copy here would be wrong the first time a message gained one.
 */
function VariablePalette({ variables }: { variables: MailTemplateMessage["variables"] }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(name: string) {
    const token = `{{${name}}}`;

    try {
      await navigator.clipboard.writeText(token);
      setCopied(name);
      window.setTimeout(() => setCopied((c) => (c === name ? null : c)), 2000);
    } catch {
      // `navigator.clipboard` needs a secure context and can refuse. A button
      // that silently does nothing is worse than one that says so.
      setCopied(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-strong bg-surface p-3">
      <h2 className="admin-title text-[15px]">What you can drop in</h2>
      <p className="mb-2.5 mt-1 text-[12.5px] text-muted">
        Click to copy, then paste into the subject or the body. Anything this message does
        not offer is removed when the email is sent.
      </p>

      <ul className="grid min-w-0 gap-1.5">
        {Object.entries(variables).map(([name, meta]) => (
          <li key={name} className="min-w-0">
            <button
              type="button"
              onClick={() => copy(name)}
              // 24px of height clears the audit's tap-target floor, and these
              // sit directly above one another.
              className="flex min-h-6 w-full min-w-0 items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-surface-2"
            >
              <code className="shrink-0 font-mono text-[12.5px] text-brand-ink">{`{{${name}}}`}</code>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{meta.about}</span>
              <span className="shrink-0 text-[11.5px] text-faint">
                {copied === name ? "Copied" : "Copy"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Mounted empty and kept mounted: a live region that appears with its
          message already inside it has not changed, so nothing is announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? `${copied} copied` : ""}
      </p>
    </div>
  );
}
