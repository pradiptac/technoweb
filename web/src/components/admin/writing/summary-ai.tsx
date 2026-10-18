"use client";

import { AiRow } from "./ai-row";
import { AiWriteButton } from "./ai-write-button";
import { setFieldValue } from "./apply";

/** `text` and `more` joined and cut to `max` at a word boundary, so a script-set value never outgrows the field. */
function append(text: string, more: string, max?: number): string {
  const joined = text ? `${text} ${more}` : more;
  if (!max || joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

/**
 * Writing help for a summary / excerpt / short-description textarea, found by id so the form that draws it can stay a server component.
 * Drawn in a row above the field; nothing at all while writing help is off.
 */
export function SummaryAi({ fieldId, type, id, max }: { fieldId: string; type: string; id?: number; max?: number }) {
  const field = () => document.getElementById(fieldId) as HTMLTextAreaElement | null;

  return (
    <AiRow caption="Writing help">
      <AiWriteButton
        surface="summary"
        ref_={{ type, id }}
        max={max}
        getInput={() => field()?.value ?? ""}
        onApply={(out, how) => {
          const el = field();
          if (el) setFieldValue(el, how === "below" ? append(el.value, out, max) : out);
        }}
      />
    </AiRow>
  );
}
