"use client";

import { useState, useTransition } from "react";
import { Badge, verificationTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { removeSubscriberAction, unsubscribeAction, verifySubscriberAction } from "../actions";
import type { NewsletterSubscriber } from "@/types/api";

const TONE: Record<string, "resolved" | "closed" | "progress" | "urgent"> = {
  active: "resolved",
  unsubscribed: "closed",
  bounced: "urgent",
  suppressed: "progress",
};

export function SubscriberRow({ subscriber }: { subscriber: NewsletterSubscriber }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [checking, startCheck] = useTransition();
  // What the last Re-check said, on the row: a refusal changes no status and
  // keeps the button mounted, which is where the reason belongs.
  const [checkResult, setCheckResult] = useState<{ ok?: string; error?: string } | null>(null);

  const verificationTitle = [
    subscriber.verification_result ? `Hunter said "${subscriber.verification_result}"` : null,
    subscriber.verification_score !== null ? `score ${subscriber.verification_score}` : null,
    subscriber.verification_at ? new Date(subscriber.verification_at).toLocaleDateString() : null,
  ].filter(Boolean).join(" · ");

  return (
    <tr className="border-b border-line last:border-0">
      <td data-label="Email" className="py-2 pr-3 font-mono text-[12.5px]">{subscriber.email}</td>

      <td data-label="Name" className="max-w-[24ch] truncate py-2 pr-3">
        {subscriber.name === subscriber.email ? <span className="text-faint">—</span> : subscriber.name}
        {subscriber.company && <span className="block text-[12px] text-faint">{subscriber.company}</span>}
      </td>

      <td data-label="Groups" className="max-w-[26ch] truncate py-2 pr-3 text-[12.5px] text-muted">
        {subscriber.groups?.length
          ? subscriber.groups.map((g) => g.name).join(", ")
          : <span className="text-faint">None</span>}
      </td>

      <td data-label="Status" className="py-2 pr-3">
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={TONE[subscriber.status] ?? "closed"}>{subscriber.status_label}</Badge>
          {/*
            Shown alongside the status rather than instead of it, because the
            two can disagree: a row imported after somebody unsubscribed reads
            "Active" and is still unmailable. Showing one would explain neither
            the exclusion nor how to undo it.
          */}
          {subscriber.suppressed && <Badge tone="urgent">Do not mail</Badge>}
          {/*
            Hunter's verdict, beside the status rather than folded into it: an
            invalid address is `active` and unmailable, which is two facts.
            Nothing is drawn for an address that was never asked about.
          */}
          {subscriber.verification !== "unverified" && (
            <span title={verificationTitle || undefined}>
              <Badge tone={verificationTone[subscriber.verification]}>{subscriber.verification_label}</Badge>
            </span>
          )}
        </span>
        {checkResult && (
          <span data-recheck className={checkResult.error ? "mt-1 block text-[12px] text-err" : "mt-1 block text-[12px] text-muted"}>
            {checkResult.error ?? checkResult.ok}
          </span>
        )}
      </td>

      <td data-label="" className="py-2 text-right">
        {/*
          Wrapping, because two buttons do not fit a 320px card.

          At that width the table is a stack of labelled rows and this cell
          holds both Unsubscribe and Delete, which ran 7px past the edge.
          Wrapping rather than trimming the padding or shortening a label: it
          holds whatever the buttons end up saying, and a second line on the
          narrowest phone is a better answer than a page that scrolls sideways.
        */}
        <div className="flex flex-wrap justify-end gap-1.5">
          {/*
            Re-check spends one of the month's allowance, which is why it is
            a button somebody presses rather than something the row does on
            its own; the nightly pass never revisits a settled verdict.
          */}
          {subscriber.status !== "unsubscribed" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              pending={checking}
              onClick={() => startCheck(async () => { setCheckResult(await verifySubscriberAction(subscriber.id)); })}
            >
              {checking ? "Asking…" : subscriber.verification === "unverified" ? "Check" : "Re-check"}
            </Button>
          )}
          {subscriber.status === "active" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => start(() => { void unsubscribeAction(subscriber.id); })}
            >
              Unsubscribe
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>

        <Modal open={confirming} onClose={() => setConfirming(false)} title={`Delete ${subscriber.email}?`}>
          <p className="measure text-[13px] text-muted">
            The record goes. <strong>Any unsubscribe stays</strong> — the do-not-mail list is
            keyed on the address and outlives this row, so deleting somebody and re-importing
            them later cannot put them back on a list they left.
          </p>
          <p className="measure mt-2 text-[13px] text-muted">
            If you only want to stop mailing them, use Unsubscribe instead: it keeps the history
            and records why.
          </p>

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              pending={pending}
              onClick={() => start(() => { void removeSubscriberAction(subscriber.id); })}
            >
              {pending ? "Deleting…" : "Delete the record"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Keep it</Button>
          </div>
        </Modal>
      </td>
    </tr>
  );
}
