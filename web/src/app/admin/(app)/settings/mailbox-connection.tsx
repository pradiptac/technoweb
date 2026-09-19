"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

/**
 * The connected mailbox, or the button that connects one.
 *
 * Shared by Outgoing mail and the Ticketing panel: the two mailboxes are
 * two consents on two slots, but what the screen says about each — who it
 * is, when it was authorised, how to let go of it — is the same box. The
 * caller supplies the verbs, because the two slots have different actions
 * behind them and different consequences to warn about.
 */
export function MailboxConnection({
  account, connectedAt, isConnected, providerLabel, busy, onConnect, onDisconnect,
  connectLabel, disconnectWarning, hint,
}: {
  account: string | null;
  connectedAt: string | null;
  isConnected: boolean;
  /** "Google" or "Microsoft" — who will ask again when access changes. */
  providerLabel: string;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  connectLabel: string;
  /** What stops when it is disconnected. Shown in the confirm. */
  disconnectWarning: string;
  /** What to do before pressing Connect. */
  hint: string;
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      isConnected ? "border-ok/25 bg-ok-soft" : "border-line-strong bg-surface-2",
    )}>
      {isConnected ? (
        <>
          <p className="text-13-5 font-semibold text-ink">
            Connected to {account}
          </p>
          <p className="mt-0.5 text-12-5 text-muted">
            {connectedAt
              ? `Authorised ${formatDate(connectedAt, "long")}.`
              : "Authorised."}{" "}
            {providerLabel} will ask again if the account password changes or access is revoked.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Disconnect ${account}? ${disconnectWarning}`)) return;
              onDisconnect();
            }}
            className="mt-2.5 text-13 font-semibold text-err hover:underline"
          >
            {busy ? "Working…" : "Disconnect"}
          </button>
        </>
      ) : (
        <>
          <p className="text-13-5 font-semibold text-ink">No mailbox connected</p>
          <p className="measure mt-0.5 text-12-5 text-muted">{hint}</p>
          <Button type="button" size="sm" className="mt-2.5" disabled={busy} onClick={onConnect}>
            {busy ? `Opening ${providerLabel}…` : connectLabel}
          </Button>
        </>
      )}
    </div>
  );
}
