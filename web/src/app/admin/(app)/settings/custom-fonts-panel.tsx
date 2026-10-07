"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, FileInput, Input } from "@/components/ui/input";
import type { CustomFont } from "@/lib/custom-fonts";
import { removeFontAction, uploadFontAction, type FontActionState } from "./fonts-actions";

/**
 * "Your own fonts" under the two font lists (0.125.0, docs/theming.md).
 *
 * Two slots. Each takes a name and a WOFF2 file — two files when the font
 * comes as separate regular and bold weights, one when it is a variable
 * font. Uploading only makes the font *available*: it then appears in the
 * Headline and Body lists above, and the site changes when one is chosen
 * there and the form is saved, like any other font.
 *
 * **Every control here is unnamed, and the buttons are `type="button"`.**
 * The panel sits inside the settings form, which posts every named control
 * and would send the files with it; these go to their own action instead,
 * built into a `FormData` by hand. A nested `<form>` is not an option — the
 * browser drops it.
 */
export function CustomFontsPanel({ fonts }: { fonts: CustomFont[] }) {
  /*
    Folded away until it is wanted: most sites use one of the nineteen
    built-in faces, and two upload forms above the corners and spacing would
    be the largest thing on the tab for the fewest people. Open by itself
    once a font is uploaded, so what is in use is never hidden.
  */
  return (
    <details className="mb-5 mt-1 rounded-lg border border-line-strong" open={fonts.length > 0} data-custom-fonts>
      <summary className="cursor-pointer px-4 py-3 text-13-5 font-semibold">
        Your own fonts
        <span className="ml-2 font-normal text-muted">
          {fonts.length > 0 ? fonts.map((f) => f.name).join(", ") : "Upload your company’s typeface"}
        </span>
      </summary>
      <div className="border-t border-line p-4">
      <p className="measure mb-4 text-12-5 text-muted">
        If your company has its own typeface, upload it here and it joins the two lists above. The file must be a
        WOFF2 (.woff2) — a TTF or OTF can be converted with a free online converter. Make sure your licence for the
        font allows it to be used on a website.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {([1, 2] as const).map((slot) => (
          <Slot key={slot} slot={slot} font={fonts.find((f) => f.slot === slot) ?? null} />
        ))}
      </div>
      </div>
    </details>
  );
}

function Slot({ slot, font }: { slot: 1 | 2; font: CustomFont | null }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<FontActionState>({});
  const [name, setName] = useState(font?.name ?? "");
  const [variable, setVariable] = useState(font?.isVariable ?? false);
  const regular = useRef<HTMLInputElement>(null);
  const bold = useRef<HTMLInputElement>(null);
  const id = `custom-font-${slot}`;

  const upload = () => {
    const data = new FormData();
    data.set("name", name.trim());
    data.set("variable", variable ? "1" : "0");
    const r = regular.current?.files?.[0];
    const b = bold.current?.files?.[0];
    if (r) data.set("regular", r);
    if (b && !variable) data.set("bold", b);

    start(async () => {
      const outcome = await uploadFontAction(slot, data);
      setResult(outcome);
      if (outcome.ok) {
        if (regular.current) regular.current.value = "";
        if (bold.current) bold.current.value = "";
      }
    });
  };

  const remove = () => start(async () => {
    const outcome = await removeFontAction(slot);
    setResult(outcome);
    if (outcome.ok) { setName(""); setVariable(false); }
  });

  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-3.5" data-custom-font-slot={slot}>
      <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-13 font-semibold">
        Font {slot}
        {font
          ? <span className="font-normal text-muted" style={{ fontFamily: `var(${font.variable})` }}>— {font.name}: The quick brown fox 0123</span>
          : <span className="font-normal text-muted">— empty</span>}
      </p>

      {/* Standing results: in the console a dismissible outcome becomes a toast, and this one says what to do next. */}
      {result.error && <Alert tone="err" title="That did not work" dismissible={false}>{result.error}</Alert>}
      {result.ok && !result.error && <Alert tone="ok" title="Done" dismissible={false}>{result.ok}</Alert>}

      <Field label="Name" htmlFor={`${id}-name`} variant="float-static" hint="As it should appear in the font lists.">
        <Input id={`${id}-name`} value={name} maxLength={40} onChange={(e) => setName(e.currentTarget.value)} placeholder="Acme Sans" />
      </Field>
      <Field label={variable ? "Font file (variable)" : "Regular weight"} htmlFor={`${id}-regular`} variant="float-static"
        hint={font ? "Leave empty to keep the file already uploaded." : "A .woff2 file, up to 2 MB."}>
        <FileInput id={`${id}-regular`} ref={regular} accept=".woff2,font/woff2" />
      </Field>
      {!variable && (
        <Field label="Bold weight (optional)" htmlFor={`${id}-bold`} variant="float-static"
          hint={font?.bold ? "A bold file is uploaded. Choose another to replace it." : "Used for headings. Without one, the browser thickens the regular weight itself."}>
          <FileInput id={`${id}-bold`} ref={bold} accept=".woff2,font/woff2" />
        </Field>
      )}
      <label className="mb-4 flex items-start gap-2.5 text-13">
        <input type="checkbox" className="mt-0.5 size-4 accent-(--color-brand-600)" checked={variable} onChange={(e) => setVariable(e.currentTarget.checked)} />
        <span>
          This is a variable font
          <span className="block text-12-5 text-muted">One file that holds every weight. Tick it only if the font was supplied that way.</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy || name.trim() === ""} onClick={upload}>
          {busy ? "Working…" : font ? "Update font" : "Upload font"}
        </Button>
        {font && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>Remove</Button>
        )}
      </div>
    </div>
  );
}
