import { Field, Input } from "@/components/ui/input";

/**
 * The one-time code input, shared by both sign-in screens.
 *
 * **One box, not six.** Six separate inputs is the design everybody reaches
 * for and it is worse in every way that can be measured here: pasting a code
 * fills the first box with all of it, a screen reader announces six unlabelled
 * fields, backspace behaviour has to be hand-written and is wrong in at least
 * one browser, and this project's audits would be looking at six adjacent
 * targets where WCAG 2.2 wants 24px of clearance. A single field costs nothing
 * and behaves.
 *
 * `autoComplete="one-time-code"` is the attribute that earns this component's
 * existence. It is what lets iOS and Android offer the code straight from the
 * notification, and it is exactly the kind of thing that gets left off one of
 * two copies — which is the argument for there being one copy.
 *
 * `inputMode="numeric"` brings up the number pad without `type="number"`,
 * which would bring a spinner, strip leading zeros, and let the value be
 * scrolled up and down by a trackpad.
 */
export function CodeField({
  length = 6,
  error,
  hint,
}: {
  length?: number;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={`${length}-digit code`} htmlFor="code" error={error} hint={hint}>
      <Input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length + 2 /* room for a space or hyphen; the API strips them */}
        // Autofocused because arriving here is always the result of pressing a
        // button on the previous step: there is one thing to do on this screen
        // and the keyboard should already be in it.
        autoFocus
        required
        aria-invalid={Boolean(error)}
        // Wide, evenly spaced digits. `tabular-nums` so the width does not
        // shift as the digits change under the cursor.
        className="text-center text-[19px] font-semibold tracking-[0.35em] tabular-nums"
      />
    </Field>
  );
}
