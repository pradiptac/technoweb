"use client";

import { NumberInput, Text } from "../../blocks/editors/shared";
import type { DetailTemplateKind } from "@/types/api";

/**
 * A record block's card (0.161.0, docs/page-builder.md "Detail templates").
 * The block holds no content — the website draws it from the record — so the
 * card says what it draws and offers the two settings this block honours on
 * this kind of page. Which those are is the API's (`heading`, `limit` on the
 * option), never decided here.
 */
export function RecordBlockEditor({ spec }: { spec: DetailTemplateKind["blocks"][number] }) {
  return (
    <div className="grid gap-1">
      <p className="measure mb-3 rounded border border-dashed border-line-strong bg-surface px-4 py-3 text-13-5 text-muted">
        {spec.blurb} Drawn from each record when its page is shown; nothing is typed here. It is placed once in a template.
      </p>
      {spec.heading && <Text path={["heading"]} label="Heading (optional)" hint="Replaces the words over this part. Leave blank for the page’s own." />}
      {spec.limit && <NumberInput path={["limit"]} label="How many (optional)" min={1} max={12} hint="At most this many entries. Leave blank for the page’s own count, four." />}
      {!spec.heading && !spec.limit && <p className="text-12-5 text-faint">Nothing to set on this part.</p>}
    </div>
  );
}
