"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import {
  createStaffAction, updateStaffAction, deleteStaffAction, type StaffFormState,
} from "./actions";
import type { AdminStaff, RoleOption } from "@/types/api";

const initial: StaffFormState = {};

export function StaffForm({
  staff, roles, isSelf, saved, blocked,
}: {
  staff?: AdminStaff;
  roles: RoleOption[];
  /** The signed-in administrator editing their own account. */
  isSelf?: boolean;
  saved?: boolean;
  blocked?: boolean;
}) {
  const editing = Boolean(staff);
  const [state, formAction, pending] = useActionState(
    editing ? updateStaffAction : createStaffAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];
  const selected = new Set(staff?.role_slugs ?? []);

  // After a successful create the form stays on screen to show the generated
  // password, which cannot be retrieved again.
  if (state.generatedPassword) {
    return (
      <>
        <Alert tone="ok" title={`${state.createdName} can now sign in`}>
          This password is shown once and cannot be recovered. Copy it and send
          it to them over something other than email if you can.
        </Alert>
        <p className="mb-6 rounded-lg border border-line-strong bg-white p-4 font-mono text-[15px] break-all select-all">
          {state.generatedPassword}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/users" className="rounded bg-ink px-3.5 py-2.5 text-[13.5px] font-semibold text-white">
            Done
          </Link>
          <Link href="/admin/users/new" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
            Add another
          </Link>
        </div>
      </>
    );
  }

  return (
    <form action={formAction} noValidate>
      {editing && <input type="hidden" name="id" value={staff!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {blocked && (
        <Alert tone="err" title="That account could not be deleted">
          It is either your own, or the last administrator. Promote someone else
          first.
        </Alert>
      )}
      {saved && !state.error && <Alert tone="ok" title="Saved">The account is updated.</Alert>}
      {state.createdName && !state.generatedPassword && (
        <Alert tone="ok" title={`${state.createdName} can now sign in`}>
          They will use the password you set.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")}>
            <Input id="name" name="name" defaultValue={staff?.name} required aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Email" htmlFor="email" error={err("email")} hint="This is how they sign in.">
            <Input id="email" name="email" type="email" defaultValue={staff?.email} required
              aria-invalid={Boolean(err("email"))} />
          </Field>

          <Field label="Password" htmlFor="password" error={err("password")}
            hint={editing
              ? "Leave blank to keep the current one. Changing it signs them out everywhere."
              : "Leave blank and one will be generated and shown to you once — better than inventing one you then have to send."}>
            <Input id="password" name="password" type="password" autoComplete="new-password"
              placeholder={editing ? "Unchanged" : "Generate one for me"} />
          </Field>

          <fieldset className="mb-[18px]">
            <legend className="mb-[7px] block text-[13.5px] font-semibold">Roles</legend>
            <p className="mb-3 text-[12.5px] text-faint">
              An administrator passes every check implicitly, so it does not need
              the others alongside it.
            </p>
            {err("roles") && <p className="mb-2 text-[12.5px] text-err">{err("roles")}</p>}

            <ul className="grid gap-2">
              {roles.map((role) => (
                <li key={role.slug}>
                  <label className="flex cursor-pointer gap-2.5 rounded border border-line-strong bg-white p-3 hover:border-faint">
                    <input
                      type="checkbox" name="roles" value={role.slug}
                      defaultChecked={selected.has(role.slug)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold">{role.label}</span>
                      <span className="block text-[12.5px] text-muted">{role.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>

        <aside className="grid content-start gap-0">
          <Field label="Active" htmlFor="is_active" error={err("is_active")}
            hint="An inactive account cannot sign in and keeps its history." variant="float-static">
            <Select
              id="is_active" name="is_active" defaultValue={staff?.is_active === false ? "0" : "1"}
              aria-invalid={Boolean(err("is_active"))}
            >
              <option value="1">Yes</option>
              <option value="0">No</option>
            </Select>
          </Field>

          {isSelf && (
            <p className="mb-[18px] rounded border border-warn-soft bg-warn-soft p-3 text-[12.5px] leading-[1.5] text-warn">
              This is your own account. You cannot deactivate it, delete it, or
              remove your administrator role — that is what stops the console
              being locked with nobody inside.
            </p>
          )}
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create account"}
        </Button>
        <Link href="/admin/users" className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && !isSelf && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteStaffAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(
                  `Delete ${staff!.name}? Their tickets stay, but become unassigned. This cannot be undone.`,
                )) e.preventDefault();
              }}
            >
              Delete account
            </Button>
          </span>
        )}
      </div>
    </form>
  );
}
