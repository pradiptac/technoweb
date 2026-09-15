"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorField } from "@/components/admin/editor-field";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Input } from "@/components/ui/input";
import type { SettingGroups } from "@/lib/admin";
import { ANNOUNCEMENT_DEFAULTS, announcementFor } from "@/lib/announcement";
import { isHex } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { ColourField } from "./settings-fields";

/**
 * The announcement bar's settings, drawn as the bar they describe.
 *
 * A panel of its own, like banners and mail: the generic grid would flow a
 * switch, two radio choices, two colours, two dates and an editor into two
 * columns of equal cells, and the one thing an editor needs — to see the
 * strip as it will paint — has no cell at all. So the controls sit above a
 * **live preview** that is the real `AnnouncementBar` fed the draft through
 * the real `announcementFor()`: the colours the picker shows adjusted, the
 * ink the derivation chose, the ticker running and pausing under the
 * pointer. A mock strip made of inline styles would be a second
 * implementation of the bar.
 *
 * Every posted value is a `setting__*` input, so this saves through the same
 * action as the rest of the screen. The two switches are a visible checkbox
 * beside a **controlled hidden input** carrying `1`/`0`: an unchecked
 * checkbox posts nothing, and `actions.ts` PATCHes only the entries it finds,
 * so a bare checkbox could never turn the bar off. The radios and checkboxes
 * are re-asserted after render the way the theme and motion pickers do,
 * because React 19 resets a form's controls when its action completes.
 */
export function AnnouncementPanel({ rows }: { rows: SettingGroups[string] }) {
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""])) as Record<string, string>;

  const [enabled, setEnabled] = useState(stored.announcement_enabled === "1");
  const [closable, setClosable] = useState(stored.announcement_closable !== "0");
  const [style, setStyle] = useState<"solid" | "gradient">(stored.announcement_style === "gradient" ? "gradient" : "solid");
  const [mode, setMode] = useState<"fixed" | "ticker">(stored.announcement_mode === "ticker" ? "ticker" : "fixed");
  const [colour, setColour] = useState(stored.announcement_colour || ANNOUNCEMENT_DEFAULTS.colour);
  const [colour2, setColour2] = useState(stored.announcement_colour_2 || ANNOUNCEMENT_DEFAULTS.colour2);
  const [html, setHtml] = useState(stored.announcement_message ?? "");

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const radios: Record<string, string> = { setting__announcement_style: style, setting__announcement_mode: mode };
    for (const input of el.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
      const should = input.value === radios[input.name];
      if (input.checked !== should) input.checked = should;
    }
    const boxes: Record<string, boolean> = { "announcement-enabled": enabled, "announcement-closable": closable };
    for (const input of el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      const should = boxes[input.id];
      if (should !== undefined && input.checked !== should) input.checked = should;
    }
  });

  // The draft as the site would paint it — live forced on, so the preview
  // shows what the switch would show.
  const preview = announcementFor({
    announcement_live: "1",
    announcement_message: html,
    announcement_style: style,
    announcement_colour: colour,
    announcement_colour_2: colour2,
    announcement_mode: mode,
    announcement_closable: closable ? "1" : "0",
  });

  return (
    <div ref={ref} className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
        <Switch id="announcement-enabled" name="setting__announcement_enabled" checked={enabled} onChange={setEnabled}>
          Show the info bar
        </Switch>
        <Switch id="announcement-closable" name="setting__announcement_closable" checked={closable} onChange={setClosable}>
          Visitors can close it
        </Switch>
        <p className="min-w-0 basis-full text-12-5 text-muted">
          Closed stays closed for that visitor&rsquo;s browser session; a changed message comes back.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Choice
          name="setting__announcement_style"
          legend="Background"
          value={style}
          onChange={(v) => setStyle(v as "solid" | "gradient")}
          choices={[
            { id: "solid", label: "Solid", note: "One colour across the strip." },
            { id: "gradient", label: "Gradient", note: "Left to right, from the first colour to the second." },
          ]}
        />
        <Choice
          name="setting__announcement_mode"
          legend="Message"
          value={mode}
          onChange={(v) => setMode(v as "fixed" | "ticker")}
          choices={[
            { id: "fixed", label: "Fixed", note: "Centred and still." },
            { id: "ticker", label: "Ticker", note: "Scrolls across; pauses under the pointer, and has a pause button." },
          ]}
        />
      </div>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <ColourField
          id="announcement_colour"
          label={style === "gradient" ? "First colour" : "Colour"}
          hint="Text is set to read on it: white or near-black, whichever needs the colour moved least."
          value={colour}
          adjusted={preview?.stops[0] ?? colour}
          onChange={setColour}
        />
        {/* Rendered whatever the style, so the stored value is still posted;
            hidden rather than unmounted for the same reason. */}
        <div className={cn(style !== "gradient" && "hidden")}>
          <ColourField
            id="announcement_colour_2"
            label="Second colour"
            hint="The right-hand end of the gradient. The same text has to read on both."
            value={colour2}
            adjusted={preview?.stops[1] ?? colour2}
            onChange={setColour2}
          />
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <label className="grid gap-1 text-13">
          <span className="font-semibold">Show from</span>
          <Input type="datetime-local" name="setting__announcement_starts_at" defaultValue={stored.announcement_starts_at ?? ""} />
        </label>
        <label className="grid gap-1 text-13">
          <span className="font-semibold">Show until</span>
          <Input type="datetime-local" name="setting__announcement_ends_at" defaultValue={stored.announcement_ends_at ?? ""} />
        </label>
        <p className="text-12-5 text-muted sm:col-span-2">
          Blank means always. Set both to run a promotion for a period without remembering to switch it off; the site checks the dates on its own clock.
        </p>
      </div>

      <EditorField
        name="setting__announcement_message"
        label="Message"
        defaultValue={stored.announcement_message ?? ""}
        onChange={setHtml}
        hint="One line. Bold, italic, underline and links survive; headings, pictures, tables and colours are removed on save."
      />

      <div>
        <p className="mb-2 text-13-5 font-semibold">Preview</p>
        {/* `.public-site` so the strip takes the public type floor it will
            have on the site rather than the console's denser one. */}
        <div className="public-site overflow-hidden rounded-lg border border-line-strong">
          {preview ? (
            <AnnouncementBar announcement={preview} preview />
          ) : (
            <p className="px-4 py-3 text-13 text-muted">Write a message above and the strip appears here.</p>
          )}
        </div>
        {preview && !isHex(colour) && (
          <p className="mt-2 text-12-5 text-warn">The first colour is not a hex, so the preview shows the default; the save will refuse it.</p>
        )}
      </div>
    </div>
  );
}

/** A visible checkbox whose value is posted by a controlled hidden input — see the panel's note. */
function Switch({ id, name, checked, onChange, children }: { id: string; name: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-13-5 font-semibold">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand-600" />
      <input type="hidden" name={name} value={checked ? "1" : "0"} />
      {children}
    </label>
  );
}

function Choice({ name, legend, value, onChange, choices }: {
  name: string; legend: string; value: string; onChange: (id: string) => void;
  choices: { id: string; label: string; note: string }[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-13-5 font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((c) => (
          <label
            key={c.id}
            className={cn(
              "block cursor-pointer rounded-lg border p-3 transition-colors",
              value === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30" : "border-line-strong bg-card hover:border-faint",
            )}
          >
            <input type="radio" name={name} value={c.id} checked={value === c.id} onChange={() => onChange(c.id)} className="sr-only" />
            <span className="block text-13 font-semibold text-ink">{c.label}</span>
            <span className="mt-0.5 block text-12 leading-snug text-muted">{c.note}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
