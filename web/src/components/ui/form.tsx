"use client";

import { useCallback, useEffect, useRef, type ComponentProps } from "react";

/**
 * A `<form>` that does not throw away what somebody typed when the server
 * refuses it.
 *
 * **React 19 resets a form after a function action completes.** That is
 * deliberate on React's part and right for the common case — post a comment,
 * the box empties — but it fires on a *rejected* submission too, and this
 * product is full of forms whose whole job is to come back and say which field
 * was wrong. Measured in a browser against real Laravel, before this existed:
 *
 *     /contact          422 -> name, email, phone, company, subject, message all ""
 *     /portal/register  422 -> every one of six fields ""
 *     /admin/blog/new   422 -> slug and excerpt ""
 *
 * So the error named a field that was no longer on screen, and the enquiry
 * somebody had just written was gone. `CLAUDE.md` claimed the opposite — "the
 * inputs are uncontrolled ... so a failed action loses nothing" — which was
 * true under React 18 and has been wrong since the upgrade. Nothing caught it:
 * a form losing its contents is not something the audits can see.
 *
 * ## How it works, and the version that was wrong
 *
 * The submitted values are kept in a ref and put back once the action's state
 * settles. React's reset happens in the commit; a passive effect runs after
 * one, so this always has the last word.
 *
 * The first cut did something cleverer and worse: it moved each control's
 * **default** to what had been typed, on the theory that "reset to defaults"
 * would then restore rather than clear. That is order-independent, which was
 * the appeal, and it fails two ways. It does not survive a re-commit — React
 * writes `defaultValue` back from its own props, so on `/contact` the fields
 * kept were `name` and `phone` and the fields cleared were `email` and
 * `message`, the two the server had complained about. **The fields a form is
 * refused over are exactly the fields whose props change, so exactly the ones
 * that trick cannot keep**: it reads as working and is worthless. And undoing
 * it on success meant restoring a default captured before the first submit,
 * which for a toggle that had just been saved would have shown the old value
 * back. Nothing here touches defaults now.
 *
 * ## Success still clears
 *
 * `state` is the `useActionState` value. Every action in this codebase reports
 * a refusal as `error` and/or `fieldErrors` and reports success some other way
 * (`ok`, `sent`, `done`, `uploaded`, or a redirect), so one predicate covers
 * all 77 of the forms that have a state. On anything that is not a refusal
 * this does nothing at all,
 * and React's own reset stands — so posting a ticket reply still empties the
 * box. Omit `state` and the component is exactly a `<form>`.
 *
 * ## Two things it deliberately does not put back
 *
 * **Passwords.** Refilling one from script leaves a credential on screen for
 * whoever is at the desk next, and it is the one field every browser and
 * password manager treats as special. Somebody retypes it.
 *
 * **Files.** `input[type=file]` cannot be set from script at all — a browser
 * rule, not an omission here. A refused form has genuinely lost the choice,
 * so it has to *say* so rather than look as though the file is still attached.
 */

type ActionState = { error?: unknown; fieldErrors?: unknown } | null | undefined;

/** A refusal, as every action in this codebase reports one. */
export function actionFailed(state: ActionState): boolean {
  return Boolean(state && (state.error || state.fieldErrors));
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Everything somebody types that can be put back. */
function preservable(el: Element): el is Control {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    return false;
  }
  if (!el.name || el.disabled) return false;
  // A hidden input is set by code, so the next render is already the truth
  // about it — and `$ACTION_*` are React's own transport fields.
  if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file" || el.type === "password")) {
    return false;
  }
  return true;
}

export function Form({
  state,
  onSubmitCapture,
  children,
  ...props
}: ComponentProps<"form"> & { state?: ActionState }) {
  const ref = useRef<HTMLFormElement>(null);
  /** What was submitted, by control name. */
  const sent = useRef(new Map<string, string | boolean>());
  /**
   * Nothing to put back until something has actually been submitted. Without
   * this the effect would fire on mount and on any unrelated state change.
   */
  const submitted = useRef(false);

  const handleSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      sent.current.clear();
      for (const el of Array.from(event.currentTarget.elements)) {
        if (!preservable(el)) continue;
        sent.current.set(
          el.name,
          el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
            ? el.checked
            : el.value,
        );
      }
      submitted.current = true;
      onSubmitCapture?.(event);
    },
    [onSubmitCapture],
  );

  useEffect(() => {
    const form = ref.current;
    if (!form || !submitted.current || !actionFailed(state)) return;
    submitted.current = false;

    for (const el of Array.from(form.elements)) {
      if (!preservable(el)) continue;
      const was = sent.current.get(el.name);
      if (was === undefined) continue;

      /*
       * Only a control React has just cleared is touched. One somebody has
       * typed into since the submit is theirs, and overwriting it would be
       * the bug this exists to fix, pointing the other way.
       */
      if (typeof was === "boolean") {
        const box = el as HTMLInputElement;
        if (box.checked !== was && box.checked === box.defaultChecked) box.checked = was;
      } else if (el instanceof HTMLSelectElement) {
        // A select has no `defaultValue`; what it defaulted to is whichever
        // option carries `defaultSelected`.
        if (el.value !== was && (el.selectedOptions[0]?.defaultSelected ?? true)) el.value = was;
      } else if (el.value !== was && el.value === el.defaultValue) {
        el.value = was;
      }
    }
  }, [state]);

  return (
    <form ref={ref} onSubmitCapture={handleSubmit} {...props}>
      {children}
    </form>
  );
}
