"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Field, Select } from "@/components/ui/input";
import type { UploadLimits } from "@/lib/admin";

/**
 * The two field components the settings form composes that are not shared
 * primitives: a dropdown that explains its chosen option, and the read-only
 * php.ini facts beside the upload limit. Split out of `settings-form.tsx`
 * with the copy tables so that file is the form alone.
 */

/**
 * A setting whose value is one of a fixed set, with the chosen option
 * explaining itself underneath.
 *
 * The description is the point. "Good" and "High" are not self-evident, and a
 * five-step scale where every step is a judgement call needs to say what each
 * one costs — otherwise people either leave the default forever or move it to
 * the end and wonder why the files got big.
 *
 * It updates on change rather than only on save, so the consequence is visible
 * while the choice is being made.
 */
export function ChoiceField({
  id, label, value, options,
}: {
  id: string;
  label: string;
  value: string | null;
  options: { value: string; label: string; description: string }[];
}) {
  const [chosen, setChosen] = useState(value ?? options[0]?.value ?? "");
  const description = options.find((o) => o.value === chosen)?.description;

  /*
    Re-assert the DOM value after every render, because something else changes
    it behind React's back.

    Saving re-renders this tree, which re-creates the `<option>` children — and
    a browser drops a `<select>`'s selection when its options are replaced,
    falling back to whichever carries `selected`. React does not repair it:
    from its side the `value` prop never changed, so there is nothing to
    update. The result is a field showing the *old* option while the state
    behind it, and the database, both hold the new one — reported as "I chose
    best and saved, and it still shows high".

    A text input cannot hit this: it has no children to replace. That is why
    only the dropdown misbehaved, and why the fix lives here rather than on the
    form.
  */
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== chosen) el.value = chosen;
  });

  return (
    <div>
      {/* `float-static`: a select always has a value, so an animated label has
          nothing to be displaced by and would render over the chosen option. */}
      <Field label={label} htmlFor={id} variant="float-static" hint={description}>
        <Select ref={ref} id={id} name={id} value={chosen} onChange={(e) => setChosen(e.currentTarget.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/**
 * What the server accepts, next to what the console asks for.
 *
 * Read-only, and deliberately not rendered as disabled inputs: php.ini is not
 * something this application can write, and a greyed-out field invites people
 * to try. These are facts about the machine, so they read as facts.
 *
 * It exists because the failure it prevents is invisible from either side
 * alone. A limit set above `upload_max_filesize` does nothing — PHP discards
 * the file before any application code runs — and above `post_max_size` it is
 * worse: PHP throws away the *whole* request body, so Laravel sees no file at
 * all and validation reports the field as missing. The screen says 20 MB, the
 * server refuses at 2 MB, and without this neither one mentions the other.
 */
export function ServerLimits({ uploads }: { uploads: UploadLimits }) {
  const mb = (kb: number) =>
    // PHP writes "0" or "-1" for no limit, which the API turns into PHP_INT_MAX
    // so the minimum ignores it. Printing that number would be nonsense.
    kb >= Number.MAX_SAFE_INTEGER / 1024 ? "no limit" : `${(kb / 1024).toFixed(kb % 1024 === 0 ? 0 : 1)} MB`;

  const capped = uploads.capped || uploads.video_capped;

  return (
    <div className="mb-5 sm:col-span-2">
      {capped && (
        <Alert tone="warn" title="This server is enforcing a smaller limit">
          A size above what php.ini allows cannot take effect — PHP refuses the
          upload before this application sees it. Uploads are being capped at{" "}
          <strong>{mb(uploads.php_ceiling_kb)}</strong>.
        </Alert>
      )}

      <div className="rounded border border-line bg-surface px-3.5 py-3">
        {/* h2, not h3: the settings page goes h1 -> this, and `npm run audit`
            fails a heading-level jump. Styled small rather than sized by its
            level, which is what the type roles are for. */}
        <h2 className="mb-0.5 text-13 font-semibold">What this server allows</h2>
        <p className="measure mb-3 text-12-5 text-muted">
          Set by php.ini, not by this console. A limit above these does nothing
          — raising it means changing php.ini and restarting PHP.
        </p>

        <dl className="grid gap-x-5 gap-y-2 text-12-5 sm:grid-cols-3">
          <Limit label="upload_max_filesize" value={mb(uploads.php_upload_max_kb)}
            note="The largest single file PHP will accept." />
          <Limit label="post_max_size" value={mb(uploads.php_post_max_kb)}
            note="The whole request, so it must exceed the file itself." />
          <Limit label="In force now" value={mb(uploads.max_kb)}
            note="The smaller of your setting and the two above." />
          <Limit label="Resolution ceiling" value={`${uploads.max_megapixels} MP`}
            note="Checked from the image header, before anything is decoded." />
        </dl>
      </div>
    </div>
  );
}

function Limit({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-11-5 text-faint">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      <p className="text-11-5 text-faint">{note}</p>
    </div>
  );
}
