"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/input";
import { FormActions } from "@/components/admin/form-actions";
import { IconLayers } from "@/components/icons-ui";
import { cn } from "@/lib/utils";
import { MANIFESTS } from "@/themes/manifests";
import { parseOptionsRow } from "@/themes/options";
import { ThemeOptionsEditor, type OptionsDraft } from "./theme-options-editor";
import { saveSettingsAction, type SettingsFormState } from "../settings/actions";

const initial: SettingsFormState = {};

/** The screenshot's box; `theme-shots` writes 1280×800, drawn at 640×400. */
const SHOT = { width: 640, height: 400 };

/**
 * One radio card per manifest, posting `setting__site_theme`.
 *
 * The motion picker's shape: the radios are `sr-only` inside a label, the
 * checked one is re-asserted in an effect because React 19 resets a form's
 * controls after its action returns — refused or not — and a radio that
 * came back unchecked would show no theme active. Preview is a plain `<a>`
 * in a new tab rather than a `Link`: `/theme-preview/*` is a dynamic,
 * signed-in route, and a `Link` would prefetch it from every render of this
 * screen.
 */
export function ThemesGallery({
  stored, active, overridden, screenshots, optionsRow,
}: {
  /** What the setting holds, which may be an id nothing is registered as. */
  stored: string;
  /** The `site_theme_options` row as the API published it, `image_url`s included. */
  optionsRow: string;
  /** What the site renders for it — `classic` when the id is unknown. */
  active: string;
  /** `SITE_THEME` is set in the server's environment and wins over the setting. */
  overridden: boolean;
  /** Which manifests have a screenshot under `public/`. */
  screenshots: Record<string, boolean>;
}) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);
  const [chosen, setChosen] = useState(active);
  // Every theme's options, edited in place; posted whole as one JSON field.
  const [draft, setDraft] = useState<OptionsDraft>(() => parseOptionsRow(optionsRow) as OptionsDraft);
  const draftJson = JSON.stringify(draft);
  const dirty = chosen !== stored || draftJson !== JSON.stringify(parseOptionsRow(optionsRow));

  // On a wrapper, not on `Form`: `Form` holds its own ref for the snapshot it
  // puts back after a refusal, and a ref prop would replace it.
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const input of el.querySelectorAll<HTMLInputElement>('input[name="setting__site_theme"]')) {
      const should = input.value === chosen;
      if (input.checked !== should) input.checked = should;
    }
  });

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Theme saved">The site is rebuilt on its next request.</Alert>
      )}
      {overridden && (
        <Alert tone="warn" title="The server is overriding this choice" dismissible={false}>
          <code>SITE_THEME</code> is set in the site&rsquo;s environment, so the site renders
          that theme whatever is chosen here. Saving still records the choice for when
          the override is removed.
        </Alert>
      )}
      {stored && stored !== active && (
        <Alert tone="warn" title={`No theme is registered as “${stored}”`} dismissible={false}>
          The site is rendering <b>Classic</b> instead. Choose one below to replace it.
        </Alert>
      )}

      <fieldset ref={ref}>
        <legend className="sr-only">Site theme</legend>
        {/* Four to a row from `lg`, the client's ask on 2026-09-16: the cards are a picker, not a showcase, and the options under them are what the screen is for. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MANIFESTS.map((m) => {
            const isActive = m.id === active;
            const isChosen = m.id === chosen;
            return (
              // The link sits outside the label: an anchor inside a label is
              // two controls on one click, and a card that is a control must
              // hold no other — the `Card href` rule, one level down.
              <div
                key={m.id}
                className={cn(
                  "overflow-hidden rounded-lg border transition-colors",
                  isChosen ? "border-brand-500 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
                )}
              >
              <label className="block cursor-pointer">
                <input
                  type="radio" name="setting__site_theme" value={m.id}
                  checked={isChosen} onChange={() => setChosen(m.id)} className="sr-only"
                />
                {screenshots[m.id] ? (
                  <Image
                    src={m.screenshot} alt={`The ${m.name} theme's homepage`}
                    width={SHOT.width} height={SHOT.height} unoptimized
                    // The first card is the screen's largest paint; lazy there is the dev LCP warning.
                    loading="eager"
                    className="aspect-[16/10] w-full object-cover object-top"
                  />
                ) : (
                  <div className="grid aspect-[16/10] w-full place-items-center bg-surface-2 text-faint" aria-hidden>
                    <IconLayers className="size-8" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-13-5 font-semibold text-ink">{m.name}</span>
                    {isActive && (
                      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-11 font-semibold text-ok">Active</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-12 leading-snug text-muted">{m.blurb}</p>
                  {m.extends && (
                    <p className="mt-1 text-11-5 text-faint">Based on {MANIFESTS.find((p) => p.id === m.extends)?.name ?? m.extends}</p>
                  )}
                </div>
              </label>
              <div className="border-t border-line px-3 py-2">
                <a
                  href={`/theme-preview/${m.id}`} target="_blank" rel="noopener"
                  className="inline-block py-1 text-12-5 font-semibold text-brand-ink hover:underline"
                >
                  Preview in a new tab
                </a>
              </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* The options for the theme the radio has chosen — not necessarily
          the active one, so an editor can set up a theme before switching. */}
      <input type="hidden" name="setting__site_theme_options" value={draftJson} />
      <div className="mt-8 border-t border-line pt-6">
        <h2 className="text-16 font-semibold text-ink">
          Options for {MANIFESTS.find((m) => m.id === chosen)?.name ?? chosen}
        </h2>
        <p className="measure mt-1 text-13 text-muted">
          Each theme keeps its own. Saved with the theme, and shown in its preview.
        </p>
        <ThemeOptionsEditor theme={chosen} draft={draft} onChange={setDraft} />
      </div>

      <FormActions dirty={dirty}>
        <Button type="submit" pending={pending} disabled={!dirty && !pending}>
          {pending ? "Saving…" : chosen !== stored ? `Activate ${MANIFESTS.find((m) => m.id === chosen)?.name ?? chosen}` : "Save options"}
        </Button>
      </FormActions>
    </Form>
  );
}
