"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Alert } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { IconLayers } from "@/components/icons";
import { deleteGroupAction, saveGroupAction } from "../actions";
import type { NewsletterGroup } from "@/types/api";

export function GroupManager({ groups }: { groups: NewsletterGroup[] }) {
  const [state, action, saving] = useActionState(saveGroupAction, {});
  const [editing, setEditing] = useState<NewsletterGroup | null>(null);
  const [deleting, setDeleting] = useState<NewsletterGroup | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      {state.error && <Alert tone="err" title="Not saved">{state.error}</Alert>}
      {state.ok && <Alert tone="ok" title={state.ok} />}

      <form
        action={action}
        // `key` on the form, so a successful save resets the fields: the
        // inputs are uncontrolled and would otherwise still hold what was
        // typed, which reads as the save not having happened.
        key={editing?.id ?? state.ok ?? "new"}
        className="mb-4 grid gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end"
      >
        <input type="hidden" name="id" value={editing?.id ?? ""} />

        <Field label="Name" htmlFor="name" variant="float">
          <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
        </Field>

        <Field label="Description" htmlFor="description" variant="float"
          hint="For colleagues, not for subscribers — it is never sent.">
          <Input id="description" name="description" defaultValue={editing?.description ?? ""} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create group"}
          </Button>
          {editing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          )}
        </div>
      </form>

      {groups.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No groups yet">
          A campaign is sent to groups, so you need at least one before you can send anything.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{group.name}</p>
                {group.description && <p className="truncate text-[12px] text-faint">{group.description}</p>}
              </div>

              {/*
                Both figures, because the gap between them is the interesting
                one: a group of 900 with 40 mailable is a group somebody needs
                to look at, and the total alone hides that entirely.
              */}
              <Link
                href={`/admin/newsletter/subscribers?group=${group.id}`}
                className="shrink-0 text-[12.5px] tabular-nums text-muted hover:text-ink"
              >
                <span className="font-semibold text-ink">{group.active_count.toLocaleString()}</span>
                {" "}mailable
                {group.subscriber_count !== group.active_count && (
                  <span className="text-faint"> of {group.subscriber_count.toLocaleString()}</span>
                )}
              </Link>

              <div className="flex shrink-0 gap-1.5">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(group)}>Rename</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(group)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title={`Delete “${deleting?.name}”?`}>
        <p className="measure text-[13px] text-muted">
          The group goes and its memberships go with it. <strong>No subscriber is
          deleted</strong> — a group is a label, and the addresses are the expensive thing.
        </p>
        <p className="measure mt-2 text-[13px] text-muted">
          Anyone who was only in this group will still be on the list, in no group at all.
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              const id = deleting?.id;
              if (!id) return;
              start(() => { void deleteGroupAction(id); });
              setDeleting(null);
            }}
          >
            Delete the group
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>Keep it</Button>
        </div>
      </Modal>
    </>
  );
}
