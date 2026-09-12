"use client";

import { useActionState, useState } from "react";

import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CoverField } from "@/components/admin/cover-field";
import { FormActions } from "@/components/admin/form-actions";
import { createPopupAction, updatePopupAction, type PopupState } from "./actions";
import type { PopupMeta } from "@/lib/admin";
import type { AdminPopup } from "@/types/api";

const initial: PopupState = {};

/**
 * A `datetime-local` input wants `YYYY-MM-DDTHH:mm` and the API sends ISO 8601
 * with an offset on it. Trimming to the first sixteen characters is what the
 * control accepts — and it keeps the *stored* instant rather than shifting it,
 * since both sides of this form are the same machine's local time.
 *
 * An empty window stays empty: `""` is "no start", not the epoch.
 */
function forInput(iso: string | null): string {
  if (!iso) return "";

  const at = new Date(iso);

  if (Number.isNaN(at.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function PopupForm({ popup, meta }: { popup?: AdminPopup; meta: PopupMeta }) {
  const action = popup ? updatePopupAction.bind(null, popup.id) : createPopupAction;
  const [state, formAction, pending] = useActionState(action, initial);

  const [size, setSize] = useState(popup?.size ?? "medium");
  const [frequency, setFrequency] = useState(popup?.frequency ?? "session");

  /*
    Held in state so the summary below the checklist can say what this popup
    currently targets. It is the one thing about a popup that cannot be checked
    by looking at it — the picture is on screen, the pages it covers are not.
  */
  const [sections, setSections] = useState<string[]>(popup?.sections ?? []);
  const [paths, setPaths] = useState((popup?.paths ?? []).join("\n"));

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  const toggle = (value: string) =>
    setSections((current) =>
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
    );

  /*
    The same expansion the API does, so the editor sees what ticking a box
    means before publishing and going to look. It is a *preview* rather than
    what is sent — the form posts keys and the server resolves them, which is
    what keeps `SiteSection` off this side of the wire.
  */
  const covered = [
    ...sections.map((key) => {
      const path = meta.sections.find((s) => s.value === key)?.path ?? "";

      return path === "/" ? "/" : `${path.replace(/\/+$/, "")}/*`;
    }),
    ...paths.split(/\r?\n/).map((p) => p.trim()).filter(Boolean),
  ];

  return (
    <Form action={formAction} state={state}>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Name"
          htmlFor="name"
          error={err("name")}
          hint="For this list only. A popup is a picture — nobody visiting the site ever reads this."
        >
          <Input id="name" name="name" defaultValue={popup?.name} required maxLength={120} />
        </Field>

        <Field label="Status" htmlFor="status" variant="float-static" error={err("status")}>
          <Select id="status" name="status" defaultValue={popup?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </div>

      {/* Both `defaultPath` and `defaultUrl`: the field previews from a URL and
          cannot derive one from a stored path, and the form posts the path
          back because that is what the record holds. */}
      <CoverField
        name="image_path"
        label="Picture"
        defaultPath={popup?.image_path ?? null}
        defaultUrl={popup?.image ?? null}
        description="The whole of the popup. There is no heading and no body text — whatever the artwork says is what it says."
        hint={meta.sizes.find((s) => s.value === size)?.blurb ?? "PNG, JPG, GIF, WebP or SVG."}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Link"
          htmlFor="link_url"
          error={err("link_url")}
          hint="Optional. When set, the whole picture is the link. A path like /store, or a full https:// address."
        >
          <Input id="link_url" name="link_url" defaultValue={popup?.link_url ?? ""} placeholder="/store/products/x" />
        </Field>

        <Field
          label="Size"
          htmlFor="size"
          variant="float-static"
          error={err("size")}
          hint={meta.sizes.find((s) => s.value === size)?.blurb}
        >
          <Select id="size" name="size" value={size} onChange={(e) => setSize(e.target.value)}>
            {meta.sizes.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="mb-6 flex items-center gap-2.5 text-[13.5px]">
        <input
          type="checkbox" name="link_new_tab" className="size-4 accent-brand-600"
          defaultChecked={popup?.link_new_tab ?? false}
        />
        Open the link in a new tab
        <span className="text-muted">— for anything that leaves this site.</span>
      </label>

      {/* ------------------------------------------------------- targeting */}

      <h2 className="admin-title mb-1 text-[17px]">Where it appears</h2>
      <p className="measure mb-3 text-[13px] text-muted">
        Ticking a section covers that page <em>and</em> everything beneath it — Store means{" "}
        <code className="font-mono text-[12.5px]">/store</code> and every product under it. Home is
        the one exception and means the front page exactly.
      </p>

      {err("sections") && <Alert tone="err" title="Nowhere to appear">{err("sections")}</Alert>}

      <fieldset className="mb-4 rounded-lg border border-line-strong bg-surface p-4">
        <legend className="px-1 text-[12.5px] font-semibold uppercase tracking-[.06em] text-faint">
          Sections
        </legend>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {meta.sections.map((section) => (
            <label key={section.value} className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                name="sections"
                value={section.value}
                checked={sections.includes(section.value)}
                onChange={() => toggle(section.value)}
                className="size-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0 truncate">
                {section.label}{" "}
                {/* The path, because "Products" and "Store" are two words a
                    client uses interchangeably and this is what settles which
                    one they mean. */}
                <code className="font-mono text-[12px] text-muted">{section.path}</code>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Other pages"
        htmlFor="paths"
        error={err("paths.0") ?? err("paths")}
        hint="One per line. A path like /about, a subtree like /blog/*, or * for the whole site."
      >
        <Textarea
          id="paths" name="paths" rows={3}
          value={paths}
          onChange={(e) => setPaths(e.target.value)}
          placeholder={"/about\n/blog/*"}
        />
      </Field>

      {/*
        What it currently adds up to.

        Targeting is the one thing about a popup that cannot be checked by
        looking at it: the picture is on screen and the pages it covers are
        not, so an editor who has ticked the wrong box finds out by publishing
        it and going to look.
      */}
      <p className="mb-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
        {covered.length === 0
          ? "Nothing is ticked, so this would appear nowhere."
          : <>
            <span>Appears on:</span>
            {/*
              Each pattern in its own bordered chip rather than a run of
              `<code>` with a margin between them. Home resolves to `/` and
              Store to `/store/*`, and side by side those painted as
              `//store/*` — one unreadable token, where the whole point of
              showing the expansion is that somebody can check it against an
              address bar.
            */}
            {covered.map((p) => (
              <code
                key={p}
                className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-ink"
              >
                {p}
              </code>
            ))}
          </>}
      </p>

      {/* ------------------------------------------------------- behaviour */}

      <h2 className="admin-title mb-3 text-[17px]">When it appears</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="How often"
          htmlFor="frequency"
          variant="float-static"
          error={err("frequency")}
          hint={meta.frequencies.find((f) => f.value === frequency)?.blurb}
        >
          <Select id="frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {meta.frequencies.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Wait before showing (ms)"
          htmlFor="delay_ms"
          error={err("delay_ms")}
          hint="1500 is a second and a half — long enough for the page to settle, short enough to be seen."
        >
          <Input
            id="delay_ms" name="delay_ms" type="number" min={0} max={60000} step={100}
            defaultValue={popup?.delay_ms ?? 1500}
          />
        </Field>

        <Field
          label="Starts"
          htmlFor="starts_at"
          variant="float-static"
          error={err("starts_at")}
          hint="Optional. Leave blank to start as soon as it is published."
        >
          <Input
            id="starts_at" name="starts_at" type="datetime-local"
            defaultValue={forInput(popup?.starts_at ?? null)}
          />
        </Field>

        <Field
          label="Ends"
          htmlFor="ends_at"
          variant="float-static"
          error={err("ends_at")}
          hint="Optional. A promotion that ends by itself is one nobody has to remember to unpublish."
        >
          <Input
            id="ends_at" name="ends_at" type="datetime-local"
            defaultValue={forInput(popup?.ends_at ?? null)}
          />
        </Field>

        <Field
          label="Order"
          htmlFor="sort_order"
          error={err("sort_order")}
          hint="Only one popup is ever shown on a page. When two target it, the lower number wins."
        >
          <Input
            id="sort_order" name="sort_order" type="number" min={0} max={65535}
            defaultValue={popup?.sort_order ?? 0}
          />
        </Field>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : popup ? "Save popup" : "Create popup"}
        </Button>
      </FormActions>
    </Form>
  );
}
