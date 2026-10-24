"use client";

import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { SlideRepeater } from "./slide-repeater";
import { createSliderAction, updateSliderAction, type SliderState } from "./actions";
import type { SliderMeta } from "@/lib/admin";
import type { Slider } from "@/types/api";
import { RecordSwitch } from "@/components/admin/record-switch";

const initial: SliderState = {};

export function SliderForm({ slider, meta, saved }: { slider?: Slider; meta: SliderMeta; saved?: boolean }) {
  const {
    transitions = [], caption_animations: captionAnimations = [], layouts = [],
    media_effects: mediaEffects = [], navigations = [], heights = [], height_steps: heightSteps = [],
  } = meta;
  const action = slider
    ? updateSliderAction.bind(null, slider.id)
    : createSliderAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const [slug, setSlug] = useState(slider?.slug ?? "");
  const [transition, setTransition] = useState(slider?.transition ?? "slide");
  const [captionAnimation, setCaptionAnimation] = useState(slider?.caption_animation ?? "none");
  const [layout, setLayout] = useState(slider?.layout ?? "full");
  const [mediaEffect, setMediaEffect] = useState(slider?.media_effect ?? "none");
  const [navigation, setNavigation] = useState(slider?.navigation ?? "dots");
  const [height, setHeight] = useState(slider?.height ?? "theme");
  const [heightMobile, setHeightMobile] = useState(slider?.height_mobile ?? "medium");
  const [heightDesktop, setHeightDesktop] = useState(slider?.height_desktop ?? "medium");

  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <Form action={formAction} state={state}>
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

        {layouts.length > 0 && (
          <Field
            label="Layout"
            htmlFor="layout"
            variant="float-static"
            error={err("layout")}
            hint={layouts.find((l) => l.value === layout)?.blurb}
          >
            <Select id="layout" name="layout" value={layout} onChange={(e) => setLayout(e.target.value)}>
              {layouts.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Transition"
          htmlFor="transition"
          variant="float-static"
          error={err("transition")}
          hint={transitions.find((t) => t.value === transition)?.blurb}
        >
          <Select id="transition" name="transition" value={transition} onChange={(e) => setTransition(e.target.value)}>
            {transitions.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>

        {/*
          How the words arrive, separately from how the picture does — a fade
          between pictures with the heading rising over it is the ordinary
          pairing. Per slider, like the transition: a style is a decision about
          the banner, not one re-made on every row.
        */}
        {captionAnimations.length > 0 && (
          <Field
            label="Text animation"
            htmlFor="caption_animation"
            variant="float-static"
            error={err("caption_animation")}
            hint={captionAnimations.find((a) => a.value === captionAnimation)?.blurb}
          >
            <Select id="caption_animation" name="caption_animation" value={captionAnimation} onChange={(e) => setCaptionAnimation(e.target.value)}>
              {captionAnimations.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* The slow zoom, the way a visitor moves between slides, and how tall the banner stands: all per slider. */}
        {mediaEffects.length > 0 && (
          <Field
            label="Picture motion"
            htmlFor="media_effect"
            variant="float-static"
            error={err("media_effect")}
            hint={mediaEffects.find((o) => o.value === mediaEffect)?.blurb}
          >
            <Select id="media_effect" name="media_effect" value={mediaEffect} onChange={(e) => setMediaEffect(e.target.value)}>
              {mediaEffects.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {navigations.length > 0 && (
          <Field
            label="Navigation"
            htmlFor="navigation"
            variant="float-static"
            error={err("navigation")}
            hint={navigations.find((o) => o.value === navigation)?.blurb}
          >
            <Select id="navigation" name="navigation" value={navigation} onChange={(e) => setNavigation(e.target.value)}>
              {navigations.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {heights.length > 0 && (
          <Field
            label="Height"
            htmlFor="height"
            variant="float-static"
            error={err("height")}
            hint={heights.find((o) => o.value === height)?.blurb}
          >
            <Select id="height" name="height" value={height} onChange={(e) => setHeight(e.target.value)}>
              {heights.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}
        {height === "fixed" && heightSteps.length > 0 && (
          <>
            <Field label="On phones" htmlFor="height_mobile" variant="float-static" error={err("height_mobile")}>
              <Select id="height_mobile" name="height_mobile" value={heightMobile} onChange={(e) => setHeightMobile(e.target.value)}>
                {heightSteps.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="On larger screens" htmlFor="height_desktop" variant="float-static" error={err("height_desktop")}>
              <Select id="height_desktop" name="height_desktop" value={heightDesktop} onChange={(e) => setHeightDesktop(e.target.value)}>
                {heightSteps.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>

      <RecordSwitch className="mb-6" name="autoplay" defaultChecked={slider?.autoplay ?? true} label="Advance slides automatically"
        hint="Ignored for anyone who has asked for reduced motion." />

      {/* The whole point of the feature, so it is on the form rather than in
          documentation nobody opens. */}
      <div className="mb-6 rounded-lg border border-line-strong bg-surface p-4">
        <p className="text-13 font-semibold">Embed this slider anywhere</p>
        <p className="mt-1 text-13 text-muted">
          Paste this into any page, post, article or case-study body:
        </p>
        <code className="mt-2 block rounded border border-line bg-card px-3 py-2 font-mono text-13 select-all">
          {`[slider slug="${slug || "your-slug"}"]`}
        </code>
      </div>

      <h2 className="admin-title mb-3 text-17">Slides</h2>
      <SlideRepeater
        slides={slider?.slides ?? []}
        meta={meta}
        errors={state.fieldErrors}
      />

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : slider ? "Save slider" : "Create slider"}
        </Button>
      </FormActions>
    </Form>
  );
}
