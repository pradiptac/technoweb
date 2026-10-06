"use client";

import { useActionState, useCallback, useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import { SettingSwitch } from "@/components/admin/setting-switch";
import { draftPageWithAiAction, type AiDraftState } from "./ai-draft-action";
import type { AiDraftAvailability } from "@/types/api";

const BRIEF_MAX = 1500;

const LENGTHS = [
  { value: "short", label: "Short — 3 or 4 sections" },
  { value: "standard", label: "Standard — 5 or 6 sections" },
  { value: "long", label: "Long — 7 to 9 sections" },
] as const;

/**
 * "Draft with AI" (0.116.0): a brief, a length and whether to use the
 * library's pictures, sent to the AI page builder, which saves an unpublished
 * builder page and sends the editor to it.
 *
 * Errors render **inline, not as toasts**: the form sits in a modal
 * `<dialog>`, which is in the top layer and makes the rest of the document
 * inert — a toast raised behind it would be neither seen nor reachable. So the
 * refusal sentence goes under the brief, and anything else in a
 * non-dismissible alert inside the dialog.
 *
 * Unavailable (switched off, no key, the day's cap) the button still opens
 * the dialog, which then says why instead of offering a form that can only be
 * refused — an absent button would leave the editor to guess.
 */
export function AiDraftButton({ availability, settingsHref }: {
  availability: AiDraftAvailability | null;
  /** Where the AI SEO assistant is switched on, or null to draw no link. */
  settingsHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [state, action, pending] = useActionState<AiDraftState, FormData>(draftPageWithAiAction, {});
  const [briefLength, setBriefLength] = useState(0);
  const [pictures, setPictures] = useState(true);
  const formId = useId();

  // An older API sends no `ai_draft`; treat it as unavailable rather than offer a form it would 404.
  const available = availability?.available ?? false;
  const reason = availability?.reason
    ?? "The AI page builder is not available on this server yet.";
  const briefError = state.fieldErrors?.brief?.[0];

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}
        title="The assistant lays out a draft page from a few sentences about it">
        Draft with AI
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Draft a page with AI"
        description="Describe the page; the assistant lays it out as builder sections and saves it as a draft."
        footer={available ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={close}>Cancel</Button>
            <Button type="submit" form={formId} size="sm" pending={pending}>
              {pending ? "Drafting…" : "Draft the page"}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={close}>Close</Button>
        )}
      >
        {available ? (
          <Form id={formId} action={action} state={state}>
            <Field
              label="What is the page for?"
              htmlFor="ai-draft-brief"
              error={briefError}
              hint={
                <>
                  {briefLength} / {BRIEF_MAX} characters
                  {briefLength > 0 && briefLength < 10 ? " — at least 10" : ""}
                </>
              }
            >
              <Textarea
                id="ai-draft-brief"
                name="brief"
                required
                minLength={10}
                maxLength={BRIEF_MAX}
                rows={6}
                aria-invalid={briefError ? true : undefined}
                onChange={(e) => setBriefLength(e.target.value.length)}
                placeholder="A page for our annual maintenance contracts: who they are for, what is covered, how a call-out works, and a way to ask for a quote."
              />
            </Field>

            <Field label="Length" htmlFor="ai-draft-length" variant="float-static">
              <Select id="ai-draft-length" name="length" defaultValue="standard">
                {LENGTHS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </Field>

            <div className="mb-[18px]">
              <SettingSwitch
                id="ai-draft-pictures"
                name="pictures"
                checked={pictures}
                onChange={setPictures}
                align="start"
                note="Only pictures that have alt text are offered to the assistant."
              >
                Use pictures from the media library
              </SettingSwitch>
            </div>

            <p className="measure text-12-5 text-muted">
              The draft is saved unpublished. Facts the assistant cannot know are left as [CHECK: …] for you to
              fill in; it never invents figures, prices, quotes or clients.
            </p>

            {/* Mounted empty, so the line is announced when it appears. */}
            <p role="status" className={pending ? "mt-3 text-12-5 font-semibold text-ink-2" : undefined}>
              {pending ? "Drafting… this can take up to a minute." : ""}
            </p>

            {state.error && (
              <div className="mt-3">
                <Alert tone="err" title="The page was not drafted" dismissible={false}>{state.error}</Alert>
              </div>
            )}
          </Form>
        ) : (
          <Alert tone="info" title="The assistant cannot draft a page right now" dismissible={false}>
            {reason}
            {settingsHref && (
              <>
                {" "}
                <Link href={settingsHref} className="font-semibold underline">Open the SEO settings</Link>
              </>
            )}
          </Alert>
        )}
      </Modal>
    </>
  );
}
