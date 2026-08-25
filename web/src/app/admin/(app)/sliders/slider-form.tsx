"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { SlideRepeater } from "./slide-repeater";
import { createSliderAction, updateSliderAction, type SliderState } from "./actions";
import type { Slider } from "@/types/api";

const initial: SliderState = {};

export function SliderForm({ slider, saved }: { slider?: Slider; saved?: boolean }) {
  const action = slider
    ? updateSliderAction.bind(null, slider.id)
    : createSliderAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(slider?.slug ?? "");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction}>
      {/*
        `saved` comes from ?saved=1 in the URL, which survives a failed submit
        because a failure does not redirect. Without this condition the screen
        shows "Saved" and "Could not save" one above the other, and the older
        of the two is the reassuring one.
      */}
      {saved && !state.error && (
        <Alert tone="ok" title="Saved">The slider is live wherever it is embedded.</Alert>
      )}
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={slider?.name} required />
        </Field>

        <Field
          label="Slug"
          htmlFor="slug"
          error={err("slug")}
          hint="Leave blank to generate one. Changing it breaks every shortcode already using it."
        >
          <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="homepage-hero" />
        </Field>

        <Field label="Status" htmlFor="status" variant="float-static">
          <Select id="status" name="status" defaultValue={slider?.status ?? "published"}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>

        <Field
          label="Seconds between slides"
          htmlFor="interval_ms"
          error={err("interval_ms")}
          hint="Between 2 and 60 seconds."
        >
          <Input
            id="interval_ms" name="interval_ms" type="number" min={2000} max={60000} step={500}
            defaultValue={slider?.interval_ms ?? 6000}
          />
        </Field>
      </div>

      <label className="mb-6 flex items-center gap-2.5 text-[13.5px]">
        <input type="checkbox" name="autoplay" value="1" defaultChecked={slider?.autoplay ?? true} className="size-4 accent-brand-600" />
        Advance slides automatically
        <span className="text-muted">— ignored for anyone who has asked for reduced motion.</span>
      </label>

      {/* The whole point of the feature, so it is on the form rather than in
          documentation nobody opens. */}
      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-[13px] font-semibold">Embed this slider anywhere</p>
        <p className="mt-1 text-[13px] text-muted">
          Paste this into any page, post, article or case-study body:
        </p>
        <code className="mt-2 block rounded border border-line bg-white px-3 py-2 font-mono text-[13px] select-all">
          {`[slider slug="${slug || "your-slug"}"]`}
        </code>
      </div>

      <h2 className="admin-title mb-3 text-[17px]">Slides</h2>
      <SlideRepeater slides={slider?.slides ?? []} />

      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : slider ? "Save slider" : "Create slider"}
        </Button>
      </FormActions>
    </form>
  );
}
