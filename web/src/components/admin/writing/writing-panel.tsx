"use client";

import { useId, useState } from "react";
import { writeAction } from "@/app/admin/(app)/writing-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Prose } from "@/components/ui/prose";
import type { WritingModeKey, WritingStatus, WritingSurface, WritingToneKey } from "@/types/writing";

const number = new Intl.NumberFormat("en-IN");

export function WritingPanel({
  open, onClose, surface, ref_, getInput, html = false, max, draftLabel, modes, status, onApply, format, hideBelow = false,
}: {
  open: boolean;
  onClose: () => void;
  surface: WritingSurface;
  ref_: Record<string, unknown>;
  getInput: () => string;
  html?: boolean;
  max?: number;
  /** "Draft a reply": shows the brief box whatever the mode. */
  draftLabel?: string;
  modes?: WritingModeKey[];
  status: WritingStatus;
  onApply: (output: string, how: "replace" | "below") => void;
  /** What to show of the answer when it is not itself readable (a campaign block comes back as JSON). */
  format?: (output: string) => string;
  /** For a surface where "insert below" means nothing (a heading, a subject line). */
  hideBelow?: boolean;
}) {
  const id = useId();
  const offered = status.modes.filter((m) => !modes || modes.includes(m.value));
  const [mode, setMode] = useState<WritingModeKey>(offered[0]?.value ?? "write");
  const [tone, setTone] = useState<WritingToneKey>("default");
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [used, setUsed] = useState(status.used);

  const needsBrief = Boolean(draftLabel) || (offered.find((m) => m.value === mode)?.needs_brief ?? false);

  async function suggest() {
    setPending(true);
    setError(null);
    try {
      const res = await writeAction({ surface, mode, tone, brief: brief.trim() || undefined, input: getInput(), ref: ref_, max });
      if (res.ok) {
        setOutput(res.output);
        setUsed((n) => n + 1);
      } else {
        setOutput(null);
        setError(res.error);
      }
    } finally {
      setPending(false);
    }
  }

  function close() {
    setOutput(null);
    setError(null);
    onClose();
  }

  function apply(how: "replace" | "below") {
    if (output === null) return;
    try {
      onApply(output, how);
    } catch {
      setError("That answer could not be used. Try again.");
      return;
    }
    close();
  }

  return (
    <Modal open={open} onClose={close} title="Writing help" size="side" dataAttr="writing-panel">
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="What to do">
          {offered.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant={m.value === mode ? "primary" : "secondary"}
              aria-pressed={m.value === mode}
              onClick={() => { setMode(m.value); setOutput(null); setError(null); }}
            >
              {m.value === "write" && draftLabel ? draftLabel : m.label}
            </Button>
          ))}
        </div>

        <Field label="Tone" htmlFor={`${id}-tone`} variant="float-static" className="mb-0">
          <Select id={`${id}-tone`} value={tone} onChange={(e) => setTone(e.target.value as WritingToneKey)}>
            {status.tones.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        {needsBrief && (
          <Field label="What should it say?" htmlFor={`${id}-brief`} className="mb-0">
            <Textarea id={`${id}-brief`} rows={3} maxLength={600} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </Field>
        )}

        <div>
          <Button type="button" pending={pending} disabled={mode === "tone" && tone === "default"} onClick={suggest}>Suggest</Button>
        </div>

        {error && <Alert tone="err" title="Writing help could not do that" dismissible={false}>{error}</Alert>}

        {output !== null && (
          <>
            {html ? (
              <Prose html={format ? format(output) : output} className="rounded-lg border border-line bg-card p-3" />
            ) : (
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-line bg-card p-3 text-14 text-ink">{format ? format(output) : output}</p>
            )}
            {output.includes("[CHECK:") && (
              <Alert tone="warn" title="Unchecked facts" dismissible={false}>Check every [CHECK: …] before you save or send.</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => apply("replace")}>Replace</Button>
              {!hideBelow && <Button type="button" size="sm" variant="secondary" onClick={() => apply("below")}>Insert below</Button>}
              <Button type="button" size="sm" variant="ghost" onClick={() => setOutput(null)}>Discard</Button>
            </div>
          </>
        )}

        <p className="text-12 text-muted">{number.format(used)} of {number.format(status.cap)} writing requests used today</p>
      </div>
    </Modal>
  );
}
