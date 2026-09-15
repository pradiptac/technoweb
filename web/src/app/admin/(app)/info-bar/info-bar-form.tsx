"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { AnnouncementPanel } from "../settings/announcement-panel";
import { saveSettingsAction, type SettingsFormState } from "../settings/actions";
import type { SettingGroups } from "@/lib/admin";

const initial: SettingsFormState = {};

/**
 * The announcement panel inside a form of its own. Everything in it posts
 * under `setting__announcement_*`, which is the whole contract with
 * `saveSettingsAction`; the settings screen's form no longer carries the
 * group, so the two cannot save it twice.
 */
export function InfoBarForm({ rows }: { rows: SettingGroups[string] }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Info bar saved">The site picks this up immediately.</Alert>
      )}

      <AnnouncementPanel rows={rows} />

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save info bar"}
        </Button>
      </FormActions>
    </Form>
  );
}
