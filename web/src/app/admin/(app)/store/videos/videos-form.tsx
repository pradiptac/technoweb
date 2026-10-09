"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { SettingSwitch } from "@/components/admin/setting-switch";
import { LABELS } from "../../settings/settings-copy";
import { saveVideosAction, type VideosFormState } from "../actions";
import type { SettingRow } from "@/lib/admin";

const initial: VideosFormState = {};

/**
 * Store → Product videos (0.140.0): where the "shop the videos" row shows, how
 * it looks and whether it plays by itself.
 *
 * Every control posts under `setting__<key>`, the contract the settings
 * screens established, so `saveVideosAction` reads them the way the promo
 * band's does; `PATCH /admin/store/videos` refuses any other key by name. The
 * shape and the order are drawn from the `options` the API sends — nothing
 * here lists them. Each on/off row is a `SettingSwitch`, its state held here
 * because the autoplay note and the "nothing will show" line read it.
 */
export function VideosForm({ rows, productsWithVideo }: { rows: SettingRow[]; productsWithVideo: number }) {
  const [state, formAction, pending] = useActionState(saveVideosAction, initial);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r])) as Record<string, SettingRow | undefined>;
  const value = (key: string) => byKey[key]?.value ?? "";
  const meta = (key: string) => LABELS[key] ?? { label: key };

  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(
    ["store_videos_shop_enabled", "store_videos_product_enabled", "store_videos_product_others", "store_videos_home_enabled", "store_videos_autoplay", "store_videos_show_sku"]
      .map((key) => [key, value(key) === "1"]),
  ));
  const flip = (key: string) => (checked: boolean) => setOn((prev) => ({ ...prev, [key]: checked }));
  const anywhere = on.store_videos_shop_enabled || on.store_videos_product_enabled || on.store_videos_home_enabled;

  const text = (key: string) => (
    <Field key={key} label={meta(key).label} htmlFor={`setting__${key}`} hint={meta(key).hint}>
      <Input id={`setting__${key}`} name={`setting__${key}`} defaultValue={value(key)} placeholder={meta(key).placeholder} />
    </Field>
  );

  const choice = (key: string) => (
    <Field label={meta(key).label} htmlFor={`setting__${key}`} variant="float-static"
      hint={byKey[key]?.options?.find((o) => o.value === value(key))?.description}>
      <Select id={`setting__${key}`} name={`setting__${key}`} defaultValue={value(key) || byKey[key]?.options?.[0]?.value}>
        {(byKey[key]?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Product videos saved">The site picks this up on its next request.</Alert>
      )}

      <p className="measure mb-5 text-13 text-muted" role="status">
        {productsWithVideo === 0
          ? <>No product has a video yet, so the row draws nothing anywhere. Add one on a product&rsquo;s Media tab — a YouTube link (a Shorts link works) or a file from the library.</>
          : <><strong className="font-semibold text-ink-2">{productsWithVideo}</strong> {productsWithVideo === 1 ? "published product has" : "published products have"} a video
            {" "}— the row is drawn from {productsWithVideo === 1 ? "it" : "them"}. <Link href="/admin/store/products?video=1" className="font-semibold text-brand-ink underline">See which</Link>.</>}
      </p>
      {productsWithVideo > 0 && !anywhere && (
        <Alert tone="warn" title="Switched off everywhere" dismissible={false}>
          Every place the row can appear is off, so it shows nowhere. Builder pages can still carry it as a &ldquo;Product videos&rdquo; section.
        </Alert>
      )}

      <h2 className="mb-1 text-15-5 font-semibold">Where it shows</h2>
      <p className="measure mb-4 text-13 text-muted">
        A row is drawn only when a product has a video, so switching a place on with nothing to show changes nothing.
      </p>
      <div className="mb-8 grid gap-3 rounded-lg border border-line-strong bg-surface px-4 py-4">
        <SettingSwitch id="videos-shop" name="setting__store_videos_shop_enabled" checked={on.store_videos_shop_enabled} onChange={flip("store_videos_shop_enabled")}
          note="After Top Picks, before the promo band.">
          {meta("store_videos_shop_enabled").label}
        </SettingSwitch>
        <SettingSwitch id="videos-product" name="setting__store_videos_product_enabled" checked={on.store_videos_product_enabled} onChange={flip("store_videos_product_enabled")}
          note={'A small "Watch" row on a product page: that product\'s own videos first.'}>
          {meta("store_videos_product_enabled").label}
        </SettingSwitch>
        <SettingSwitch id="videos-others" name="setting__store_videos_product_others" checked={on.store_videos_product_others} onChange={flip("store_videos_product_others")}
          note="Off, a product page shows only its own videos — and nothing when it has none.">
          {meta("store_videos_product_others").label}
        </SettingSwitch>
        <SettingSwitch id="videos-home" name="setting__store_videos_home_enabled" checked={on.store_videos_home_enabled} onChange={flip("store_videos_home_enabled")}
          note="A section of the homepage. Its place, background and on/off are on the Themes screen, with the others.">
          {meta("store_videos_home_enabled").label}
        </SettingSwitch>
      </div>

      <h2 className="mb-3 text-15-5 font-semibold">How it reads</h2>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {text("store_videos_heading")}
        {text("store_videos_lede")}
      </div>

      <h2 className="mb-3 mt-4 text-15-5 font-semibold">How it looks</h2>
      <div className="grid gap-x-6 sm:grid-cols-3">
        {choice("store_videos_shape")}
        <Field label={meta("store_videos_limit").label} htmlFor="setting__store_videos_limit" hint="From 4 to 24.">
          <Input id="setting__store_videos_limit" name="setting__store_videos_limit" type="number" min={4} max={24} inputMode="numeric" defaultValue={value("store_videos_limit") || "12"} />
        </Field>
        {choice("store_videos_order")}
      </div>
      <div className="mb-8 mt-1">
        <SettingSwitch id="videos-sku" name="setting__store_videos_show_sku" checked={on.store_videos_show_sku} onChange={flip("store_videos_show_sku")}>
          {meta("store_videos_show_sku").label}
        </SettingSwitch>
      </div>

      <h2 className="mb-3 text-15-5 font-semibold">Playing</h2>
      <div className="mb-5 rounded-lg border border-line-strong bg-surface px-4 py-4">
        <SettingSwitch id="videos-autoplay" name="setting__store_videos_autoplay" checked={on.store_videos_autoplay} onChange={flip("store_videos_autoplay")}
          align="start"
          note={on.store_videos_autoplay
            ? "On: a video plays silently, in a loop, while it is on screen — at most four at once, with a Pause button. This contacts YouTube as soon as the row is on screen, without a press; where the cookie banner is in use it waits until the visitor accepts, and it never plays under reduced motion or Save-Data. Pressing a tile plays that one with sound."
            : "Off: each video shows a picture and a play button, and nothing is requested from YouTube until somebody presses it. One plays at a time."}>
          {meta("store_videos_autoplay").label}
        </SettingSwitch>
      </div>

      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save product videos"}
        </Button>
      </FormActions>
    </Form>
  );
}
