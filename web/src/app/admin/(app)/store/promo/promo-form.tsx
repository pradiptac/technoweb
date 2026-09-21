"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { FormActions } from "@/components/admin/form-actions";
import { LABELS } from "../../settings/settings-copy";
import { savePromoAction, type PromoFormState } from "../actions";
import type { SettingRow } from "@/lib/admin";

const initial: PromoFormState = {};

/**
 * The shop front's promotions: the wide band's eight settings and the two
 * tiles' seven each, on one screen, in the order they appear on the page —
 * the tiles first, because they sit above the band there.
 *
 * Every control posts under `setting__<key>`, the contract the settings
 * screen's own form established, so `savePromoAction` reads them the way
 * `saveSettingsAction` does. `PATCH /admin/store/promo` refuses any key it
 * does not know by name, so a control added here without a seeded row is a
 * 422 rather than a silent no-op.
 *
 * Each switch is a visible checkbox beside a **controlled hidden input**
 * carrying `1`/`0` — an unchecked checkbox posts nothing, and the action
 * PATCHes only what it finds, so a bare checkbox could never turn a thing
 * off. Re-asserted after render the way the info bar's is, because React 19
 * resets a form's controls when its action completes. Written once, as
 * `Switch`, because there are three of them now.
 */
export function PromoForm({ rows }: { rows: SettingRow[] }) {
  const [state, formAction, pending] = useActionState(savePromoAction, initial);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r])) as Record<string, SettingRow | undefined>;
  const value = (key: string) => byKey[key]?.value ?? "";
  const meta = (key: string) => LABELS[key] ?? { label: key };

  const text = (key: string) => (
    <Field key={key} label={meta(key).label} htmlFor={`setting__${key}`} hint={meta(key).hint}>
      <Input id={`setting__${key}`} name={`setting__${key}`} defaultValue={value(key)} placeholder={meta(key).placeholder} />
    </Field>
  );

  const picture = (key: string) => (
    <CoverField
      name={`setting__${key}`}
      label={meta(key).label}
      defaultPath={byKey[key]?.value ?? null}
      defaultUrl={byKey[key]?.url ?? null}
      description={meta(key).hint}
    />
  );

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Promo banners saved">The shop front picks this up immediately.</Alert>
      )}

      <h2 className="mb-1 text-15-5 font-semibold">Two tiles</h2>
      <p className="measure mb-4 text-13 text-muted">
        Side by side above the band. One switched on takes the whole row; neither, and the row is not drawn.
      </p>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        {([1, 2] as const).map((n) => {
          const k = (f: string) => `store_tile_${n}_${f}`;
          return (
            <section key={n} aria-labelledby={`tile-${n}-title`} className="rounded-lg border border-line-strong bg-card p-5">
              <h3 id={`tile-${n}-title`} className="mb-3 text-14 font-semibold">Tile {n}</h3>
              <Switch
                id={`tile-${n}-enabled`}
                name={`setting__${k("enabled")}`}
                initial={value(k("enabled")) === "1"}
                label={meta(k("enabled")).label}
                note="Off until a heading or a picture is filled in."
              />
              {text(k("kicker"))}
              {text(k("heading"))}
              <Field label={meta(k("text")).label} htmlFor={`setting__${k("text")}`} hint={meta(k("text")).hint}>
                <Textarea id={`setting__${k("text")}`} name={`setting__${k("text")}`} rows={2} defaultValue={value(k("text"))} />
              </Field>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {text(k("cta_label"))}
                {text(k("cta_href"))}
              </div>
              {picture(k("image_path"))}
            </section>
          );
        })}
      </div>

      <h2 className="mb-1 text-15-5 font-semibold">Wide band</h2>
      <p className="measure mb-4 text-13 text-muted">
        The dark band under the tiles — a headline, a price line and a picture bleeding off the right.
      </p>

      <Switch
        id="promo-enabled"
        name="setting__store_promo_enabled"
        initial={value("store_promo_enabled") === "1"}
        label={meta("store_promo_enabled").label}
        note="Off until the words and the picture below are filled in — a half-finished dark band is worse than none."
      />

      <div className="grid gap-x-6 sm:grid-cols-2">
        {(["store_promo_kicker", "store_promo_price_text", "store_promo_heading"] as const).map((key) => (
          <div key={key}>{text(key)}</div>
        ))}

        <div className="sm:col-span-2">
          <Field label={meta("store_promo_subheading").label} htmlFor="setting__store_promo_subheading" hint={meta("store_promo_subheading").hint}>
            <Textarea id="setting__store_promo_subheading" name="setting__store_promo_subheading" rows={3} defaultValue={value("store_promo_subheading")} />
          </Field>
        </div>

        {(["store_promo_cta_label", "store_promo_cta_href"] as const).map((key) => (
          <div key={key}>{text(key)}</div>
        ))}

        <div className="sm:col-span-2">{picture("store_promo_image_path")}</div>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save promo banners"}
        </Button>
      </FormActions>
    </Form>
  );
}

/** A visible checkbox whose posted value is the `1`/`0` on the hidden input beside it. */
function Switch({ id, name, initial, label, note }: {
  id: string; name: string; initial: boolean; label: string; note: string;
}) {
  const [on, setOn] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.checked !== on) ref.current.checked = on;
  });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line-strong bg-surface px-4 py-3">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-13-5 font-semibold">
        <input ref={ref} id={id} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-brand-600" />
        <input type="hidden" name={name} value={on ? "1" : "0"} />
        {label}
      </label>
      <p className="min-w-0 basis-full text-12-5 text-muted">{note}</p>
    </div>
  );
}
