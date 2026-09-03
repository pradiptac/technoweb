"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/input";
import { rebuildMenuAction, type RebuildState } from "./actions";

const initial: RebuildState = {};

/**
 * Rebuild a location's menu from the catalogue.
 *
 * **The one destructive control in this module**, so it asks first — through
 * the real `<dialog>`, which traps focus, closes on Escape and renders in the
 * top layer rather than losing a z-index argument with the sticky header.
 *
 * The confirmation says what goes, not just "are you sure": an editor pressing
 * this on an assigned menu is discarding an afternoon's arranging, and the
 * useful question is whether they know that.
 */
export function RebuildButton({
  location,
  label,
  assigned,
}: {
  location: string;
  label: string;
  assigned: boolean;
}) {
  const [state, action, pending] = useActionState(rebuildMenuAction, initial);
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors hover:border-faint"
      >
        Rebuild to default
      </button>

      {state.error && (
        <Alert tone="err" title="That did not work">{state.error}</Alert>
      )}

      {state.ok && (
        <Alert tone="ok" title="Rebuilt">
          {state.ok}
          {state.warnings && state.warnings.length > 0 && (
            /*
              Left-out links are reported rather than swallowed. A footer short
              of a link is exactly the kind of thing nobody notices, and the
              usual cause is a CMS page this install has never had.
            */
            <ul className="mt-1.5 list-disc pl-4">
              {state.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </Alert>
      )}

      <Modal open={asking} onClose={() => setAsking(false)} title={`Rebuild ${label.toLowerCase()}?`}>
        <p className="measure text-[13.5px] leading-[1.6]">
          This replaces every item in this menu with the navigation the site renders on its
          own — the current solutions, product categories, services and industries.
        </p>

        {assigned && (
          <p className="measure mt-2.5 text-[13.5px] leading-[1.6]">
            <strong>Anything arranged here is discarded.</strong> The menu itself is kept, so
            it stays assigned and its link does not change — only the items inside it are
            replaced.
          </p>
        )}

        <p className="measure mt-2.5 text-[12.5px] leading-[1.55] text-muted">
          It stays a written list afterwards: renaming a record still follows it, but a newly
          published solution or category will not appear until somebody adds it or rebuilds
          again.
        </p>

        <Form action={action} state={state} className="mt-4 flex flex-wrap gap-2">
          <input type="hidden" name="location" value={location} />

          <button
            type="submit"
            disabled={pending}
            onClick={() => setAsking(false)}
            className="rounded border border-err-fill bg-err-fill px-3.5 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
          >
            {pending ? "Rebuilding…" : "Rebuild it"}
          </button>

          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded border border-line-strong bg-card px-3.5 py-2 text-[13px] font-semibold transition-colors hover:border-faint"
          >
            Cancel
          </button>
        </Form>
      </Modal>
    </>
  );
}
