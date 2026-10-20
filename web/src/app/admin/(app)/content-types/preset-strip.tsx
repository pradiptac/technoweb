"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { PresetTile } from "@/types/presets";
import { installPresetAction, type PresetFormState } from "./preset-actions";

/**
 * "Start from a preset" (docs/content-presets.md): the four ready-made kinds of
 * content, each a press away. A tile says what it makes and which fields come
 * with it; once installed it opens the content instead. An address already
 * taken asks for another before anything is made.
 */
export function PresetStrip({ presets }: { presets: PresetTile[] }) {
  return (
    <section aria-labelledby="presets-heading" className="mb-8">
      <h2 id="presets-heading" className="mb-1 text-15 font-semibold text-ink">Start from a preset</h2>
      <p className="measure mb-4 text-13-5 text-muted">
        Ready-made kinds of content with their own page layout. Each becomes an ordinary content type you can rename and add fields to.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {presets.map((p) => <Tile key={p.key} preset={p} />)}
      </ul>
    </section>
  );
}

function Tile({ preset }: { preset: PresetTile }) {
  const fields = preset.types.flatMap((t) => t.fields.map((f) => f.label));

  return (
    <Card as="li" interactive={false} padding="md" className="flex flex-col">
      <h3 className="text-14-5 font-semibold text-ink">{preset.label}</h3>
      <p className="mt-1 text-13 text-ink-2">{preset.blurb}</p>
      <p className="mt-3 text-12-5 text-muted">
        <span className="sr-only">Fields: </span>{fields.join(", ")}
      </p>
      <div className="mt-auto pt-4">
        {preset.installed ? (
          <Link href={`/admin/content/${preset.installed.slug}`} className="inline-flex min-h-[36px] items-center text-13-5 font-semibold text-brand-ink hover:underline">
            Installed — open {preset.types[0].plural.toLowerCase()}
          </Link>
        ) : (
          <InstallButton preset={preset} />
        )}
      </div>
    </Card>
  );
}

function InstallButton({ preset }: { preset: PresetTile }) {
  const [state, action, pending] = useActionState<PresetFormState, FormData>(installPresetAction, {});
  const [open, setOpen] = useState(false);
  const needsAddress = Boolean(preset.clash) || Boolean(state.fieldErrors?.slug) || Boolean(state.fieldErrors?.coverage_slug);
  const coverage = preset.types[1];

  if (!needsAddress && !open) {
    return (
      <Form action={action} state={state}>
        <input type="hidden" name="key" value={preset.key} />
        {state.error && <Alert tone="err" title="Not installed" dismissible={false}>{state.error}</Alert>}
        <Button type="submit" size="sm" pending={pending}>Install {preset.label.toLowerCase()}</Button>
      </Form>
    );
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>Install {preset.label.toLowerCase()}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Install ${preset.label.toLowerCase()}`}>
        <Form action={action} state={state}>
          <input type="hidden" name="key" value={preset.key} />
          {preset.clash ? <p className="mb-4 text-13-5 text-ink-2">{preset.clash} Choose another address for it.</p> : null}
          <Field label="Address" htmlFor={`slug-${preset.key}`} error={state.fieldErrors?.slug?.[0]}
            hint="Lower-case letters, numbers and hyphens; the page lives at this address.">
            <Input id={`slug-${preset.key}`} name="slug" defaultValue={preset.clash ? `our-${preset.slug}` : preset.slug} required />
          </Field>
          {coverage ? (
            <Field label="Address for the coverage" htmlFor={`cslug-${preset.key}`} error={state.fieldErrors?.coverage_slug?.[0]}>
              <Input id={`cslug-${preset.key}`} name="coverage_slug" defaultValue={coverage.slug} />
            </Field>
          ) : null}
          {state.error && !state.fieldErrors ? <Alert tone="err" title="Not installed" dismissible={false}>{state.error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" pending={pending}>Install</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
