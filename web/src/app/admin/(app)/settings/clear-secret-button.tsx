"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { clearSecretAction } from "./actions";

/**
 * Removes a stored credential.
 *
 * Separate from the save because a blank field means "unchanged" — the form
 * can never show the current value, so it submits blank every time, and
 * treating that as a delete would wipe the SMTP password whenever anyone
 * saved an unrelated setting.
 */
export function ClearSecretButton({ settingKey, label }: { settingKey: string; label: string }) {
  const [pending, start] = useTransition();
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cleared) {
    return <p className="-mt-3 mb-4 text-[12.5px] text-muted">{label} cleared.</p>;
  }

  return (
    <div className="-mt-3 mb-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Clear the saved ${label.toLowerCase()}? It cannot be recovered.`)) return;
          start(async () => {
            const result = await clearSecretAction(settingKey);
            if (result.error) setError(result.error);
            else setCleared(true);
          });
        }}
      >
        {pending ? "Clearing…" : `Clear saved ${label.toLowerCase()}`}
      </Button>
      {error && <p className="mt-1 text-[12.5px] text-err">{error}</p>}
    </div>
  );
}
