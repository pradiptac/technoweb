"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";

/**
 * The stale-save refusal (C2, docs/notifications.md): somebody saved this
 * record after it was opened here. The typing is already back on screen
 * (`<Form>` undoes React's reset on a refusal). "Load the newer version" keeps
 * it as a draft first, so the reload offers Restore; "Save mine anyway" sends
 * the same form again with `overwrite=1`. A function-saving screen passes its
 * own handlers.
 */
export function StaleAlert({ message, onOverwrite, onLoadNewer }: { message: string; onOverwrite?: () => void; onLoadNewer?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const form = () => ref.current?.closest("form") ?? null;

  const loadNewer = () => {
    if (onLoadNewer) return onLoadNewer();
    form()?.dispatchEvent(new Event("tw:draft-save-now"));
    window.location.reload();
  };

  const saveMine = () => {
    if (onOverwrite) return onOverwrite();
    const f = form();
    if (!f) return;
    let input = f.querySelector<HTMLInputElement>('input[name="overwrite"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "overwrite";
      f.appendChild(input);
    }
    input.value = "1";
    f.requestSubmit();
    // The form's data is read during the submit event, so the flag can go now — left in place
    // it would overwrite the next newer version too, without asking.
    input.remove();
  };

  return (
    <div ref={ref} data-stale-alert>
      <Alert tone="warn" title="Somebody saved this after you opened it" dismissible={false}>
        <p>{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={loadNewer}>Load the newer version</Button>
          <Button type="button" variant="ghost" size="sm" onClick={saveMine}>Save mine anyway</Button>
        </div>
      </Alert>
    </div>
  );
}
