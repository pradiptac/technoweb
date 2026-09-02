"use client";

import { useActionState, useState, useTransition } from "react";
import { Form } from "@/components/ui/form";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

      <Form
        action={action} state={state}
        // `key` on the form, so a successful save resets the fields: the
        // inputs are uncontrolled and would otherwise still hold what was
        // typed, which reads as the save not having happened.
        key={editing?.id ?? state.ok ?? "new"}
        className="mb-4 grid gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end"
      >
        <input type="hidden" name="id" value={editing?.id ?? ""} />

        <Field label="Name" htmlFor="name" variant="float" className="mb-0">
          <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
        </Field>

        {/* No hint inside the Field: it would make this column taller than
            the buttons beside it and drop them below the inputs. */}
        <Field label="Description" htmlFor="description" variant="float" className="mb-0">
          <Input id="description" name="description" aria-describedby="description-hint"
            defaultValue={editing?.description ?? ""} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create group"}
          </Button>
          {editing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          )}
        </div>

        <p id="description-hint" className="text-[12.5px] text-faint sm:col-span-3">
          The description is for colleagues, not for subscribers — it is never sent.
        </p>
      </Form>

      {groups.length === 0 ? (
        <EmptyState icon={<IconLayers />} title="No groups yet">
          A campaign is sent to groups, so you need at least one before you can send anything.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-card px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[13px] font-medium">
                  {group.name}
                  {/*
                    Said on the row, because the missing Delete button is
                    otherwise unexplained — and an absent control reads as a
                    bug or a permission problem rather than as a rule.
                  */}
                  {group.managed && <Badge tone="brand">Kept up to date</Badge>}
                </p>
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

              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(group)}>Rename</Button>
                {/*
                  No Delete on the derived group. It would come back on the next
                  sync under a new id, having lost every campaign's record of
                  having been sent to it — so the button would appear to work
                  and quietly destroy history. The API refuses it too; this is
                  so nobody presses it.
                */}
                {!group.managed && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(group)}>Delete</Button>
                )}
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
