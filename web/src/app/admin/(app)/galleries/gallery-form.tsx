"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { GalleryEditors } from "./gallery-editors";
import { createGalleryAction, updateGalleryAction, type GalleryState } from "./actions";
import type { GalleryTransitionOption } from "@/lib/admin";
import type { Gallery } from "@/types/api";

const initial: GalleryState = {};

export function GalleryForm({
  gallery, transitions, saved,
}: {
  gallery?: Gallery;
  /** Sent by the API, never listed here — see `GalleryTransitionOption`. */
  transitions: GalleryTransitionOption[];
  saved?: boolean;
}) {
  const action = gallery
    ? updateGalleryAction.bind(null, gallery.id)
    : createGalleryAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(gallery?.slug ?? "");
  /*
    Held in state so the sentence under the dropdown describes what is
    *selected* rather than what was last saved. Read off the record, it
    explained the old choice while a new one sat on screen — which is a hint
    that is wrong exactly when somebody is reading it to decide.
  */
  const [transition, setTransition] = useState(gallery?.transition ?? "fade");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  /*
    A validation error on a picture or a tab names a field nobody can see —
    `items.3.group` is not a label on this screen. Rather than let "could not
    save" stand over a form where everything visible looks fine, the row number
    is pulled out and said in words. Same problem `buildFormTabs` solves for the
    tabbed entity forms, at a fraction of the size, because there is only one
    pane here.
  */
  const rowErrors = Object.entries(state.fieldErrors ?? {})
    .map(([key, messages]) => {
      const m = /^(items|groups)\.(\d+)\./.exec(key);
      if (!m) return null;
      const what = m[1] === "items" ? "Picture" : "Tab";
      return `${what} ${Number(m[2]) + 1}: ${messages[0]}`;
    })
    .filter((line): line is string => line !== null);

  return (
    <form action={formAction}>
      {/*
        `saved` comes from ?saved=1, which survives a failed submit because a
        failure does not redirect. Without the condition the screen shows
        "Saved" and "Could not save" one above the other, and the older of the
        two is the reassuring one.
      */}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The gallery is live wherever it is embedded.</Alert>
      )}
      {state.error && (
        <Alert tone="err" title="Could not save">
          {state.error}
          {rowErrors.length > 0 && (
            <ul className="mt-1.5 list-disc pl-4">
              {rowErrors.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")} hint="A label for this list. It is not shown on the site.">
          <Input id="name" name="name" defaultValue={gallery?.name} required />
        </Field>

        <Field
          label="Slug"
          htmlFor="slug"
          error={err("slug")}
          hint="Leave blank to generate one. Changing it breaks every shortcode already using it."
        >
          <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="recent-work" />
        </Field>

        <Field
          label="Subtitle"
          htmlFor="subtitle"
          error={err("subtitle")}
          hint="One line above the pictures. Rendered as a paragraph, never as a heading — the page's own heading does that job."
          className="lg:col-span-2"
        >
          <Input id="subtitle" name="subtitle" defaultValue={gallery?.subtitle ?? ""} />
        </Field>

        <Field label="Status" htmlFor="status" variant="float-static">
          <Select id="status" name="status" defaultValue={gallery?.status ?? "published"}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>

        {/*
          `variant="float-static"`: a select always has a value, so an animated
          label has nothing to be displaced by and would render on top of the
          chosen option.
        */}
        <Field
          label="Transition"
          htmlFor="transition"
          variant="float-static"
          error={err("transition")}
          hint={transitions.find((t) => t.value === transition)?.blurb}
        >
          <Select
            id="transition"
            name="transition"
            value={transition}
            onChange={(e) => setTransition(e.target.value)}
          >
            {transitions.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Milliseconds between pictures"
          htmlFor="interval_ms"
          error={err("interval_ms")}
          hint="Between 2 and 60 seconds."
        >
          <Input
            id="interval_ms" name="interval_ms" type="number" min={2000} max={60000} step={500}
            defaultValue={gallery?.interval_ms ?? 5000}
          />
        </Field>
      </div>

      <label className="mb-6 flex flex-wrap items-center gap-2.5 text-[13.5px]">
        <input type="checkbox" name="autoplay" value="1" defaultChecked={gallery?.autoplay ?? false} className="size-4 accent-brand-600" />
        Start the slideshow automatically when a picture is opened
        <span className="text-muted">
          — the arrows work either way, and this is ignored for anyone who has
          asked for reduced motion.
        </span>
      </label>

      {/* The whole point of the feature, so it is on the form rather than in
          documentation nobody opens. */}
      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-[13px] font-semibold">Embed this gallery anywhere</p>
        <p className="mt-1 text-[13px] text-muted">
          Paste this into any page, post, article or case-study body:
        </p>
        <code className="mt-2 block rounded border border-line bg-card px-3 py-2 font-mono text-[13px] select-all">
          {`[gallery slug="${slug || "your-slug"}"]`}
        </code>
      </div>

      <GalleryEditors groups={gallery?.groups ?? []} items={gallery?.items ?? []} />

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : gallery ? "Save gallery" : "Create gallery"}
        </Button>
      </FormActions>
    </form>
  );
}
