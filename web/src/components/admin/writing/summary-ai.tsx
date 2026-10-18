"use client";

import { AiWriteButton } from "./ai-write-button";
import { setFieldValue } from "./apply";

/**
 * Writing help for a summary / excerpt / short-description textarea, found by id so the form that draws it can stay a server component.
 * Drawn inside the field's hint; nothing at all while writing help is off.
 */
export function SummaryAi({ fieldId, type, id, max }: { fieldId: string; type: string; id?: number; max?: number }) {
  const field = () => document.getElementById(fieldId) as HTMLTextAreaElement | null;

  return (
    <AiWriteButton
      surface="summary"
      ref_={{ type, id }}
      max={max}
      getInput={() => field()?.value ?? ""}
      onApply={(out, how) => {
        const el = field();
        if (el) setFieldValue(el, how === "below" && el.value ? `${el.value} ${out}` : out);
      }}
    />
  );
}
