"use client";

import Link from "next/link";
import { Form } from "@/components/ui/form";
import { useActionState } from "react";
import { FormActions } from "@/components/admin/form-actions";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  createLocationAction, updateLocationAction, deleteLocationAction, type LocationFormState,
} from "./actions";
import type { AdminLocation } from "@/types/api";

const initial: LocationFormState = {};

/**
 * A block of checkboxes, all sharing one name.
 *
 * One `name` per group, read with `getAll` on the other side — an unchecked box
 * sends nothing at all, so a single `get` would read the first ticked service
 * as the entire list and quietly drop the rest.
 */
function Picker({ legend, name, options, checked }: {
  legend: string;
  name: string;
  options: { id: number; label: string }[];
  checked: number[];
}) {
  if (options.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">{legend}</p>
      <ul className="mt-2 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.id}>
            <label className="flex items-start gap-2 text-[13.5px]">
              <input type="checkbox" name={name} value={o.id}
                defaultChecked={checked.includes(o.id)} className="mt-0.5 size-4 shrink-0" />
              <span className="text-ink">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A place the company works in.
 *
 * Three of these fields are nullable in the database and none of them is
 * optional in practice: `LandingPageQuality` will not publish a page about a
 * place unless at least one of the address, the attendance line or the summary
 * is filled in. That is said on the form rather than discovered at publish
 * time, because the alternative is somebody adding six cities, drafting twelve
 * pages and finding out afterwards.
 */
export function LocationForm({ record, saved, blocked, parents, services, solutions }: {
  record?: AdminLocation;
  saved?: boolean;
  blocked?: string;
  /** Every other place, for the parent picker. Excludes this one. */
  parents: { id: number; name: string; full_name: string; level: string }[];
  services: { id: number; title: string }[];
  solutions: { id: number; title: string }[];
}) {
  const editing = Boolean(record);
  const [state, formAction, pending] = useActionState(
    editing ? updateLocationAction : createLocationAction, initial,
  );

  const err = (f: string) => state.fieldErrors?.[f]?.[0];

  return (
    <Form action={formAction} state={state} noValidate>
      {editing && <input type="hidden" name="id" value={record!.id} />}

      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {blocked && <Alert tone="err" title="Not deleted">{blocked}</Alert>}
      {saved && !state.error && <Alert tone="ok" title="Saved">Places update on the site immediately.</Alert>}

      {editing && !record!.has_local_substance && (
        <Alert tone="warn" title="Nothing recorded about working here yet">
          Pages about {record!.name} cannot be published until one of the three
          fields below is filled in. A page that names a city and says nothing
          specific about it is the exact pattern search engines penalise, and if
          the company does not really attend sites here it is also untrue.
        </Alert>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Field label="Name" htmlFor="name" error={err("name")} hint="The city or district as people would say it.">
            <Input id="name" name="name" defaultValue={record?.name} required
              placeholder="Kolkata" aria-invalid={Boolean(err("name"))} />
          </Field>

          <Field label="Slug" htmlFor="slug" error={err("slug")}
            hint="Part of the web address of every page about this place. Derived from the name if left blank.">
            <Input id="slug" name="slug" defaultValue={record?.slug} placeholder="kolkata"
              className="font-mono text-[14px]" aria-invalid={Boolean(err("slug"))} />
          </Field>

          {/*
            Where this sits, and what kind of place it is.

            There is no "state" field any more. The state is derived from the
            nearest ancestor, so typing it here as well would be a second answer
            to a question the parent already answers — and the two disagree the
            first time somebody moves a city.
          */}
          <Field label="Kind of place" htmlFor="level" variant="float-static" error={err("level")}
            hint="Decides how the page reads and what it rolls up. A state page lists its cities; a city page lists the work done there.">
            <Select id="level" name="level" defaultValue={record?.level ?? "city"}>
              <option value="country">Country</option>
              <option value="state">State or region</option>
              <option value="city">City or district</option>
              <option value="area">Area or neighbourhood</option>
            </Select>
          </Field>

          <Field label="Inside" htmlFor="parent_id" variant="float-static" error={err("parent_id")}
            hint="Leave empty for a place with nothing above it. A level may be skipped — a city directly inside a country is ordinary.">
            <Select id="parent_id" name="parent_id" defaultValue={record?.parent_id ?? ""}>
              <option value="">Nothing — this is a top-level place</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Where we work from" htmlFor="office_address" error={err("office_address")}
            hint="An address, or how the place is covered — “from the Kolkata store, 40 minutes”. This is one of the three that unlocks publishing.">
            <Input id="office_address" name="office_address" defaultValue={record?.office_address ?? ""} />
          </Field>

          <Field label="Attendance" htmlFor="response_time" error={err("response_time")}
            hint="What somebody can actually expect. “Same-day on site, weekdays” means something; “fast response” does not.">
            <Input id="response_time" name="response_time" defaultValue={record?.response_time ?? ""}
              placeholder="Same-day on site, weekdays" />
          </Field>

          <Field label="What we do here" htmlFor="summary" error={err("summary")}
            hint="A sentence or two that is true of this place and not of the others — the sectors, the sites, what tends to come up.">
            <Textarea id="summary" name="summary" rows={4} defaultValue={record?.summary ?? ""} />
          </Field>

          {/*
            The work actually done here.
            This is not decoration: a "<service> in <place>" page cannot be
            published unless the service is ticked below, and `areaServed` in
            the structured data is built from exactly this list. Before it
            existed the generator paired every place with the first two
            published services, which is an arbitrary combination somebody then
            had to invent copy for — the shortest path to a template with a noun
            substituted in.
          */}
          <fieldset className="mt-6 rounded-lg border border-line bg-surface p-4">
            <legend className="px-1.5 text-[13px] font-semibold text-ink">Work offered here</legend>
            <p className="measure mt-1 text-[12.5px] text-muted">
              Only what is ticked can have a page of its own about this place,
              and only what is ticked is claimed as coverage in the structured
              data. Leave the rest alone.
            </p>

            <Picker legend="Services" name="service_ids"
              options={services.map((x) => ({ id: x.id, label: x.title }))}
              checked={record?.service_ids ?? []} />
            <Picker legend="Solutions" name="solution_ids"
              options={solutions.map((x) => ({ id: x.id, label: x.title }))}
              checked={record?.solution_ids ?? []} />
          </fieldset>
        </div>

        <aside className="min-w-0">
          <Field label="Order" htmlFor="sort_order" hint="Lower numbers first.">
            <Input id="sort_order" name="sort_order" type="number" min={0}
              defaultValue={record?.sort_order ?? 0} />
          </Field>

          <label className="mt-2 flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" name="is_active" value="1" defaultChecked={record?.is_active ?? true}
              className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium text-ink">We work here</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">
                Switch off when you stop covering a place. Existing pages stay put
                until you deal with them — nothing is deleted behind your back.
              </span>
            </span>
          </label>

          {editing && (record!.landing_page_count ?? 0) > 0 && (
            <p className="measure mt-4 text-[12.5px] text-muted">
              {record!.landing_page_count} landing{" "}
              {record!.landing_page_count === 1 ? "page is" : "pages are"} about this place.
            </p>
          )}
        </aside>
      </div>

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add place"}
        </Button>
        <Link href="/admin/locations"
          className="rounded px-3.5 py-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
          Cancel
        </Link>
        {editing && (
          <span className="ml-auto">
            <Button
              type="submit" variant="destructive" size="sm"
              formAction={deleteLocationAction} formNoValidate
              onClick={(e) => {
                if (!window.confirm(`Delete ${record!.name}?`)) e.preventDefault();
              }}
            >
              Delete place
            </Button>
          </span>
        )}
      </FormActions>
    </Form>
  );
}
