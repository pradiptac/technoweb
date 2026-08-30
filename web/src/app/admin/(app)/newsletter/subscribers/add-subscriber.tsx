"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Alert } from "@/components/ui/input";
import { addCustomersAction, addSubscriberAction, pasteAddressesAction } from "../actions";
import type { NewsletterGroup } from "@/types/api";

/**
 * Adding one address by hand, and bringing the customer list across.
 *
 * Collapsed by default. This screen exists to show the list, and a form open
 * above it costs the first rows of every visit for something used
 * occasionally — the same argument that took the upload panel out of the media
 * library.
 */
export function AddSubscriber({ groups }: { groups: NewsletterGroup[] }) {
  const [open, setOpen] = useState<"none" | "one" | "paste" | "customers">("none");
  const [addState, addAction, adding] = useActionState(addSubscriberAction, {});
  const [custState, custAction, importing] = useActionState(addCustomersAction, {});
  const [pasteState, pasteAction, pasting] = useActionState(pasteAddressesAction, {});

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={open === "one" ? "primary" : "secondary"}
          onClick={() => setOpen(open === "one" ? "none" : "one")}
        >
          Add someone
        </Button>
        <Button
          type="button"
          size="sm"
          variant={open === "paste" ? "primary" : "secondary"}
          onClick={() => setOpen(open === "paste" ? "none" : "paste")}
        >
          Paste a list
        </Button>
        <Button
          type="button"
          size="sm"
          variant={open === "customers" ? "primary" : "secondary"}
          onClick={() => setOpen(open === "customers" ? "none" : "customers")}
        >
          Add existing customers
        </Button>
      </div>

      {addState.error && <Alert tone="err" title="Not added">{addState.error}</Alert>}
      {addState.ok && <Alert tone="ok" title={addState.ok} />}
      {pasteState.error && <Alert tone="err" title="Not added">{pasteState.error}</Alert>}
      {pasteState.ok && <Alert tone="ok" title="Added from the list">{pasteState.ok}</Alert>}
      {custState.error && <Alert tone="err" title="Not added">{custState.error}</Alert>}
      {custState.ok && <Alert tone="ok" title="Customers added">{custState.ok}</Alert>}

      {open === "one" && (
        <form action={addAction} className="mt-3 grid gap-2.5 rounded-lg border border-line-strong bg-card p-3.5 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" variant="float">
            <Input id="email" name="email" type="email" required />
          </Field>
          <Field label="Company" htmlFor="company" variant="float">
            <Input id="company" name="company" />
          </Field>
          <Field label="First name" htmlFor="first_name" variant="float">
            <Input id="first_name" name="first_name" />
          </Field>
          <Field label="Last name" htmlFor="last_name" variant="float">
            <Input id="last_name" name="last_name" />
          </Field>

          <GroupPicker groups={groups} />

          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
          </div>
        </form>
      )}

      {open === "paste" && (
        <form action={pasteAction} key={pasteState.ok} className="mt-3 rounded-lg border border-line-strong bg-card p-3.5">
          <label htmlFor="paste-text" className="mb-1 block text-[13px] font-semibold">
            Addresses
          </label>

          <textarea
            id="paste-text"
            name="text"
            rows={7}
            required
            aria-describedby="paste-hint"
            placeholder={"priya@example.com\nRahul Mehta <rahul@example.com>\nsales@acme.example, ops@acme.example"}
            className="w-full rounded border border-line-strong bg-card px-3 py-2 font-mono text-[13px]"
          />

          <p id="paste-hint" className="measure mt-1.5 text-[12.5px] text-faint">
            One per line, or separated by commas or semicolons.{" "}
            <span className="font-mono">Name &lt;address&gt;</span> works too — the name is
            kept and used to greet them. Anyone who has unsubscribed is skipped, and the
            reply says which addresses were not usable.
          </p>

          <div className="mt-3">
            <GroupPicker groups={groups} />
          </div>

          <div className="mt-3">
            <Button type="submit" size="sm" disabled={pasting}>
              {pasting ? "Adding…" : "Add these addresses"}
            </Button>
          </div>
        </form>
      )}

      {open === "customers" && (
        <form action={custAction} className="mt-3 rounded-lg border border-line-strong bg-card p-3.5">
          <p className="measure mb-3 text-[13px] text-muted">
            Every portal customer is checked against the do-not-mail list first. Anyone who has
            unsubscribed stays off — <strong>having an account is not consent to be marketed
            to</strong>, and this cannot override that.
          </p>

          <GroupPicker groups={groups} />

          <div className="mt-3">
            <Button type="submit" size="sm" disabled={importing}>
              {importing ? "Adding…" : "Add all customers"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function GroupPicker({ groups }: { groups: NewsletterGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-[12.5px] text-faint sm:col-span-2">
        No groups yet — they will be added without one, and you can file them later.
      </p>
    );
  }

  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-1 text-[12px] font-semibold text-muted">Groups</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="group_ids" value={g.id} />
            {g.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
