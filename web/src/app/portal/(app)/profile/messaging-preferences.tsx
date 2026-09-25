"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { saveMessagingPreferencesAction, type MessagingPreferencesState } from "./messaging-actions";
import type { MessagingPreferences as Preferences } from "@/types/api";

const initial: MessagingPreferencesState = {};

/**
 * Order and ticket updates on WhatsApp or RCS, to the mobile number on this
 * profile — only for a channel the shop can deliver on, and never ticked on
 * anybody's behalf. Browser notifications are per device and switched on
 * with the bell; here they can be turned off everywhere at once.
 */
export function MessagingPreferences({ preferences }: { preferences: Preferences }) {
  const [state, formAction, pending] = useActionState(saveMessagingPreferencesAction, initial);
  const phones = preferences.channels.filter((c) => c.channel !== "push" && (c.live || c.opted_in));
  const push = preferences.channels.find((c) => c.channel === "push");

  if (phones.length === 0 && !(push && (push.devices ?? 0) > 0)) return null;

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title="Saved">Your message preferences are saved.</Alert>}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-15 font-semibold">Messages</legend>
        <p className="mb-1 text-13 text-muted">
          {preferences.phone
            ? <>Order and ticket updates to <span className="font-mono">{preferences.phone}</span>, beside the email. Reply STOP at any time to end them.</>
            : "Add a mobile number above to receive order and ticket updates on it."}
        </p>
        {phones.map((c) => (
          <label key={c.channel} className="flex min-h-6 items-center gap-2.5 text-14">
            {/* The hidden 0 first, so an unticked box posts an explicit off. */}
            <input type="hidden" name={c.channel} value="0" />
            <input type="checkbox" name={c.channel} value="1" defaultChecked={c.opted_in}
              disabled={!preferences.phone && !c.opted_in}
              className="size-4 accent-[var(--color-brand-600)]" />
            Updates on {c.label}
          </label>
        ))}
        {push && (push.devices ?? 0) > 0 && (
          <label className="flex min-h-6 items-center gap-2.5 text-14">
            <input type="checkbox" name="push_off" value="1" className="size-4 accent-[var(--color-brand-600)]" />
            Turn off browser notifications on all {push.devices} of my devices
          </label>
        )}
      </fieldset>

      <div className="mt-4">
        <Button type="submit" size="sm" variant="secondary" pending={pending}>{pending ? "Saving…" : "Save message preferences"}</Button>
      </div>
    </Form>
  );
}
