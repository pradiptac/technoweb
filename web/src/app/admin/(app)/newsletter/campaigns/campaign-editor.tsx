"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Alert } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/admin/tabs";
import { cn } from "@/lib/utils";
import {
  audienceAction, healthAction, previewAction, saveCampaignAction,
  sendCampaignAction, testAction,
} from "../actions";
import { BlockEditor } from "./block-editor";
import type {
  NewsletterAudience, NewsletterBlock, NewsletterCampaign,
  NewsletterGroup, NewsletterHealth,
} from "@/types/api";

/**
 * Writing a campaign, checking it, and sending it.
 *
 * The order of the panels is the order of the specification's workflow, and it
 * is not arbitrary: content, then audience, then the checks, then the send.
 * Every one of those is a gate the next depends on, and a screen that let
 * somebody press Send from the first panel would be a screen where the checks
 * are optional.
 *
 * **The preview renders through the API**, on the same code path a send uses.
 * A preview built in the browser from the same blocks would be a preview of
 * something else the first time the two implementations disagreed — and email
 * HTML is exactly where they would.
 */
export function CampaignEditor({
  campaign, groups, templates,
}: {
  campaign: NewsletterCampaign;
  groups: NewsletterGroup[];
  templates: { id: number; name: string }[];
}) {
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preheader ?? "");
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(campaign.blocks ?? []);
  const [groupIds, setGroupIds] = useState<number[]>(campaign.group_ids ?? []);

  const [preview, setPreview] = useState<string>("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [audience, setAudience] = useState<NewsletterAudience | null>(null);
  const [health, setHealth] = useState<NewsletterHealth | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [schedule, setSchedule] = useState("");

  const editable = campaign.is_editable;

  /*
    A refresh with unsaved changes loses the whole campaign. `FormActions`
    gives this to ordinary forms; this screen is not one, so it carries its
    own — and it cannot see an in-app navigation, which is the documented
    limitation of the same guard elsewhere.
  */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /*
    The preview is debounced and last-write-wins.

    Without the ticket a slow render for one edit lands after a fast render for
    the next and the pane goes backwards while somebody is still typing — the
    out-of-order response bug, which looks like the preview ignoring changes.
  */
  const ticket = useRef(0);
  useEffect(() => {
    const mine = ++ticket.current;
    const timer = setTimeout(async () => {
      const html = await previewAction(blocks, preheader);
      if (mine === ticket.current) setPreview(html);
    }, 400);

    return () => clearTimeout(timer);
  }, [blocks, preheader]);

  const change = useCallback(<T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
    setMessage(null);
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);

    const result = await saveCampaignAction(campaign.id, {
      name, subject, preheader: preheader || null,
      blocks, group_ids: groupIds,
    });

    setSaving(false);

    if (result.error) setMessage({ tone: "err", text: result.error });
    else { setMessage({ tone: "ok", text: "Saved." }); setDirty(false); }
  };

  const refreshAudience = async () => setAudience(await audienceAction(campaign.id));
  const refreshHealth = async () => setHealth(await healthAction(campaign.id));

  const sendTest = async () => {
    const result = await testAction(campaign.id, testTo);
    setMessage(result.error
      ? { tone: "err", text: result.error }
      : { tone: "ok", text: result.ok ?? "Test sent." });
  };

  const send = async (scheduled?: string) => {
    setConfirming(false);
    const result = await sendCampaignAction(campaign.id, scheduled || null);
    setMessage(result.error
      ? { tone: "err", text: result.error }
      : { tone: "ok", text: result.ok ?? "Sending." });

    if (!result.error) void refreshHealth();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_460px] lg:items-start">
      <div className="min-w-0">
        {!editable && (
          <Alert tone="info" title="This campaign has been sent">
            It can no longer be edited — the report is drawn from what actually went out, and
            changing the message now would make those figures describe something nobody
            received. Duplicate it to make a new one.
          </Alert>
        )}

        {message && (
          <Alert tone={message.tone} title={message.tone === "ok" ? "Done" : "That did not work"}>
            {message.text}
          </Alert>
        )}

        <Tabs
          tabs={[
            { id: "content", label: "Content" },
            { id: "audience", label: "Audience" },
            { id: "checks", label: "Checks" },
            { id: "send", label: "Send" },
          ]}
        >
          <div id="content" className="grid gap-2.5">
            <Field label="Campaign name" htmlFor="name" variant="float"
              hint="For you, not for readers — it never appears in the email.">
              <Input id="name" value={name} disabled={!editable}
                onChange={(e) => change(setName)(e.target.value)} />
            </Field>

            <Field label="Subject" htmlFor="subject" variant="float"
              hint={`${subject.length} characters. Most clients truncate past 70, and a phone nearer 35.`}>
              <Input id="subject" value={subject} disabled={!editable}
                onChange={(e) => change(setSubject)(e.target.value)} />
            </Field>

            <Field label="Preheader" htmlFor="preheader" variant="float"
              hint="The line shown after the subject. Leave it blank and the client invents one from the first words of the body.">
              <Input id="preheader" value={preheader} disabled={!editable}
                onChange={(e) => change(setPreheader)(e.target.value)} />
            </Field>

            <BlockEditor
              blocks={blocks}
              disabled={!editable}
              onChange={change(setBlocks)}
              templates={templates}
            />
          </div>

          <div id="audience" className="grid gap-3">
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Send to</legend>
              {groups.length === 0 ? (
                <p className="measure text-[13px] text-muted">
                  There are no groups yet. A campaign needs at least one, because a group is
                  how it knows who to send to.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        disabled={!editable}
                        onChange={(e) => change(setGroupIds)(
                          e.target.checked
                            ? [...groupIds, g.id]
                            : groupIds.filter((id) => id !== g.id),
                        )}
                      />
                      {g.name}
                      <span className="text-[12px] text-faint">
                        {g.active_count.toLocaleString()} mailable
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div>
              <Button type="button" size="sm" variant="secondary" onClick={refreshAudience}>
                Work out the recipients
              </Button>
              <p className="measure mt-1.5 text-[12.5px] text-faint">
                Save first — this counts what is stored, not what is on screen.
              </p>
            </div>

            {audience && (
              <dl className="grid gap-1 rounded-lg border border-line-strong bg-card p-3.5 text-[13px]">
                <Row label="In the chosen groups" value={audience.group_contacts} />
                <Row label="In more than one group" value={-audience.duplicates_removed} />
                <Row label="Unsubscribed" value={-audience.unsubscribed_removed} />
                <Row label="Bounced" value={-audience.bounced_removed} />
                <Row label="On the do-not-mail list" value={-audience.suppressed_removed} />
                <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-semibold">Will receive it</dt>
                  <dd className="font-display text-[20px] font-semibold tabular-nums">
                    {audience.final_recipients.toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div id="checks" className="grid gap-3">
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={refreshHealth}>
                Check this campaign
              </Button>
              <p className="measure mt-1.5 text-[12.5px] text-faint">
                A heuristic, not a verdict: it catches what is reliably held against a message
                and is within your control. It cannot see your domain&rsquo;s reputation, which
                matters more than anything here.
              </p>
            </div>

            {health && (
              <>
                <div className="flex items-baseline gap-3">
                  <span className={cn("font-display text-[34px] font-semibold leading-none tabular-nums",
                    health.band === "good" ? "text-ok" : health.band === "fair" ? "text-warn" : "text-err")}>
                    {health.score}
                  </span>
                  <span className="text-[13px] text-muted">out of 100</span>
                </div>

                {health.blocking.length > 0 && (
                  <Alert tone="err" title="This cannot be sent yet">
                    <ul className="ml-4 list-disc">
                      {health.blocking.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  </Alert>
                )}

                <ul className="grid gap-1.5">
                  {health.checks.map((c) => (
                    <li key={c.key} className="flex gap-2.5 rounded border border-line bg-surface px-3 py-2 text-[13px]">
                      <span className={c.passed ? "text-ok" : c.blocking ? "text-err" : "text-warn"}>
                        {c.passed ? "✓" : "✕"}
                      </span>
                      <span className="min-w-0 flex-1">
                        {c.label}
                        {c.hint && <span className="block text-[12px] text-faint">{c.hint}</span>}
                      </span>
                      {!c.passed && c.blocking && <Badge tone="urgent">Blocks sending</Badge>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div id="send" className="grid gap-4">
            <section>
              <h3 className="mb-1.5 text-[13px] font-semibold">Send yourself a test</h3>
              <p className="measure mb-2 text-[12.5px] text-muted">
                The real message, personalised, through the real mail settings. It creates no
                recipient and touches no figure in the report.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="Leave blank to send to yourself"
                  className="min-w-[220px] flex-1"
                  aria-label="Test recipient"
                />
                <Button type="button" size="sm" variant="secondary" onClick={sendTest}>Send test</Button>
              </div>
              {campaign.test_sent_at && (
                <p className="mt-1.5 text-[12px] text-faint">
                  Last test sent {new Date(campaign.test_sent_at).toLocaleString()}.
                </p>
              )}
            </section>

            <section className="border-t border-line pt-4">
              <h3 className="mb-1.5 text-[13px] font-semibold">Send the campaign</h3>
              <p className="measure mb-2 text-[12.5px] text-muted">
                This cannot be undone. Messages go out through the queue, so the send continues
                after you close this page.
              </p>

              <div className="flex flex-wrap items-end gap-2">
                <Field label="Or schedule it" htmlFor="schedule" variant="float-static"
                  hint="Leave blank to send now.">
                  <Input id="schedule" type="datetime-local" value={schedule}
                    onChange={(e) => setSchedule(e.target.value)} />
                </Field>

                <Button
                  type="button"
                  disabled={!editable || dirty}
                  onClick={() => setConfirming(true)}
                >
                  {schedule ? "Schedule" : "Send now"}
                </Button>
              </div>

              {dirty && (
                <p className="mt-1.5 text-[12.5px] text-warn">
                  Save your changes first — sending uses what is stored, not what is on screen.
                </p>
              )}
            </section>
          </div>
        </Tabs>

        <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-line bg-surface/95 py-3 backdrop-blur-[10px]">
          <Button type="button" onClick={save} disabled={saving || !editable}>
            {saving ? "Saving…" : "Save campaign"}
          </Button>
          {dirty && <span className="text-[12.5px] text-faint">Unsaved changes</span>}
        </div>
      </div>

      <aside className="lg:sticky lg:top-16">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-[13px] font-semibold">Preview</h2>
          <div className="ml-auto flex gap-1">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                aria-pressed={device === d}
                className={cn(
                  "rounded border px-2.5 py-1 text-[12.5px] capitalize",
                  device === d
                    ? "border-brand-600 bg-brand-50 font-semibold text-brand-ink"
                    : "border-line-strong bg-card text-muted hover:text-ink",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/*
          An iframe, and it must stay one. The campaign HTML carries its own
          `<style>` and a full document; rendering it inline would leak those
          rules into the console and let a template restyle the page around it.
          `sandbox` with nothing granted means no scripts and no navigation
          from inside the preview.
        */}
        <iframe
          title="Email preview"
          srcDoc={preview}
          sandbox=""
          className={cn(
            "h-[70vh] w-full rounded-lg border border-line-strong bg-white transition-[max-width]",
            device === "mobile" ? "max-w-[380px]" : "max-w-none",
          )}
        />
      </aside>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Send this campaign?">
        <p className="measure text-[13px] text-muted">
          <strong>{audience?.final_recipients?.toLocaleString() ?? "The selected"}</strong>{" "}
          {audience ? "people" : "recipients"} will receive “{subject}”.
        </p>
        <p className="measure mt-2 text-[13px] text-muted">
          There is no unsend. If you have not sent yourself a test, do that first — it is the
          only way to see what actually arrives.
        </p>

        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={() => send(schedule)}>
            {schedule ? "Schedule it" : "Send it now"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Not yet</Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular-nums", value < 0 && "text-muted")}>
        {value < 0 ? value.toLocaleString() : value.toLocaleString()}
      </dd>
    </div>
  );
}
