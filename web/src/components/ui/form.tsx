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

/*
 * Shape checks on blur, for the fields whose shape a browser can know.
 *
 * Every form validates on the server — correctly; that stays the boundary —
 * and used to say nothing until the round trip came back. These mirror the
 * *shape* rules only: an email with no `@`, a phone that is letters, a GSTIN
 * that is not fifteen characters of the right pattern (the server's own
 * regex and sentence, from `UpdateProfileRequest`). Never on every
 * keystroke — a message under a field somebody is half-way through typing
 * into is a nag — and never for anything the server has to decide: whether
 * the address exists, whether the code was issued. The message is removed
 * the moment the field is edited again, and on submit, so it can never sit
 * beside the server's own.
 *
 * Email and tel inputs opt in by type; anything else says `data-check`.
 */
const CHECKS: Record<string, { test: RegExp; message: string }> = {
  email: { test: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: "That does not look like an email address — name@company.in is the shape." },
  tel: { test: /^\+?[0-9][0-9\s().-]{5,}$/, message: "That does not look like a phone number — digits, with a country code if outside India." },
  gstin: { test: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, message: "That does not look like a GSTIN. They are 15 characters, like 27AAPFU0939F1ZV." },
};

function checkOnBlur(el: EventTarget | null) {
  if (!(el instanceof HTMLInputElement)) return;
  const kind = el.dataset.check ?? (el.type === "email" || el.type === "tel" ? el.type : null);
  const rule = kind ? CHECKS[kind] : null;
  if (!rule) return;

  clearLiveCheck(el);
  const value = el.value.trim();
  if (!value || rule.test.test(kind === "gstin" ? value.toUpperCase() : value)) return;

  const note = document.createElement("p");
  note.dataset.liveCheck = "";
  note.id = `${el.id || el.name}-live-check`;
  note.className = "mt-1.5 text-12-5 text-err";
  note.textContent = rule.message;
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), note.id].filter(Boolean).join(" "));
  // After the control's own wrapper, so a floating label's geometry is untouched.
  (el.closest("[data-field-control]") ?? el).insertAdjacentElement("afterend", note);
}

function clearLiveCheck(el: HTMLInputElement) {
  const id = `${el.id || el.name}-live-check`;
  const note = document.getElementById(id);
  if (!note) return;
  note.remove();
  el.removeAttribute("aria-invalid");
  const described = (el.getAttribute("aria-describedby") ?? "").split(" ").filter((d) => d && d !== id).join(" ");
  if (described) el.setAttribute("aria-describedby", described); else el.removeAttribute("aria-describedby");
}

/** A refusal, as every action in this codebase reports one. */
function actionFailed(state: ActionState): boolean {
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

/**
 * A control an editor component holds in React state and gives no `name`: a
 * select or a tick box inside a repeater that posts one hidden JSON input.
 *
 * These are the controls React's reset gets wrong and `preservable()` cannot
 * see. A controlled text input survives a reset, because React keeps its
 * `value` *attribute* in step with its state and the reset restores exactly
 * that; a select and a box do not — `selected` and `checked` are set as
 * properties, so the reset lands on the first option and on unticked while
 * the state, and what is posted, still hold the real value. Measured on the
 * form builder (0.117.0): a "Tick box" row read "Short text" after a 422.
 */
function loose(el: Element): el is HTMLSelectElement | HTMLInputElement {
  if (el instanceof HTMLSelectElement) return !el.name;
  return el instanceof HTMLInputElement && !el.name && (el.type === "checkbox" || el.type === "radio");
}

export function Form({
  state,
  onSubmitCapture,
  children,
  ...props
}: ComponentProps<"form"> & { state?: ActionState }) {
  const ref = useRef<HTMLFormElement>(null);
  /**
   * What was submitted, by control. A text control is keyed by its name; a
   * checkbox or radio by its name **and value**, because a grid of checkboxes
   * shares one name — `sections` on the popup form, roles on staff — and keyed
   * by name alone the map held only the last box's state, so a refused save
   * put every box back to whatever the last one was. Measured: tick About,
   * submit with nothing else, and the tick was gone.
   */
  const sent = useRef(new Map<string, string | boolean>());
  const keyOf = (el: Element & { name: string }) =>
    el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
      ? `${el.name}\u0000${el.value}`
      : el.name;
  /**
   * Nothing to put back until something has actually been submitted. Without
   * this the effect would fire on mount and on any unrelated state change.
   */
  const submitted = useRef(false);
  /**
   * What every unnamed select and box showed at the submit, by element. Put
   * back after React's reset whatever the action answered: the component's
   * state never changed, so this is still the truth about it. Kept current
   * while the action is pending (see `onChangeCapture`), and an element that
   * has since been re-mounted is simply not in the map.
   */
  const shown = useRef(new Map<HTMLSelectElement | HTMLInputElement, string | boolean>());

  const handleSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      sent.current.clear();
      shown.current.clear();
      for (const el of Array.from(event.currentTarget.elements)) {
        if (el instanceof HTMLInputElement) clearLiveCheck(el);
        if (loose(el)) shown.current.set(el, el instanceof HTMLSelectElement ? el.value : el.checked);
        if (!preservable(el)) continue;
        sent.current.set(
          keyOf(el),
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
      const was = sent.current.get(keyOf(el));
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

  /*
    React resets the form by calling `form.reset()`, which announces itself
    with a `reset` event *before* the controls change. So the unnamed ones are
    put back a microtask later, once the reset has landed — on a success as
    much as a refusal, and with or without a `state`, since none of that
    alters what a controlled select is showing.
  */
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const onReset = () => {
      queueMicrotask(() => {
        for (const [el, was] of shown.current) {
          if (!el.isConnected) continue;
          if (el instanceof HTMLSelectElement) {
            if (typeof was === "string" && el.value !== was) el.value = was;
          } else if (typeof was === "boolean" && el.checked !== was) {
            el.checked = was;
          }
        }
        shown.current.clear();
      });
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <form
      ref={ref}
      onSubmitCapture={handleSubmit}
      onChangeCapture={(e) => {
        // Changed while the action was still running: that is the value to keep.
        const el = e.target;
        if (el instanceof Element && loose(el) && shown.current.has(el)) {
          shown.current.set(el, el instanceof HTMLSelectElement ? el.value : el.checked);
        }
      }}
      onBlurCapture={(e) => checkOnBlur(e.target)}
      onInputCapture={(e) => { if (e.target instanceof HTMLInputElement) clearLiveCheck(e.target); }}
      {...props}
    >
      {children}
    </form>
  );
}
