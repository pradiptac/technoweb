"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Alert } from "@/components/ui/input";
import { ignoreFindingAction, recheckAction, type RowState } from "./actions";
import { ROW_ACTION } from "../not-found/row-action";

const initial: RowState = {};

/** Recheck and Ignore for one row. One-press forms: they carry a state only to report. */
export function RowButtons({ id, type, subjectId, ignored }: { id: number; type: string; subjectId: number; ignored: boolean }) {
  const [ignoreState, ignoreAction, ignoring] = useActionState(ignoreFindingAction, initial);
  const [recheckState, recheck, checking] = useActionState(recheckAction, initial);

  return (
    <>
      <Form action={recheck} state={recheckState}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={subjectId} />
        <button type="submit" disabled={checking} aria-busy={checking || undefined} className={ROW_ACTION}>
          {checking ? "Checking…" : "Recheck"}
        </button>
        {recheckState.ok && <Alert tone="ok" title={recheckState.ok} />}
        {recheckState.error && <Alert tone="err" title={recheckState.error} />}
      </Form>
      <Form action={ignoreAction} state={ignoreState}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="ignored" value={ignored ? "0" : "1"} />
        <button type="submit" disabled={ignoring} aria-busy={ignoring || undefined} className={ROW_ACTION}>
          {ignoring ? "Saving…" : ignored ? "Stop ignoring" : "Ignore"}
        </button>
        {ignoreState.error && <Alert tone="err" title={ignoreState.error} />}
      </Form>
    </>
  );
}
