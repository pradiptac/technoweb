"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Form } from "@/components/ui/form";
import { PincodeAutofill, type PincodeFieldNames } from "@/components/forms/pincode-autofill";
import { Alert } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitFormAction, type SubmitState } from "./form-actions";
import { FormControl, type HeadingLevel } from "./form-controls";
import { errorFor, stepsOf } from "./form-logic";
import { useFormWatch, useHiddenFields, useHydrated } from "./form-watch";
import { PageContextFields } from "./page-context-fields";
import type { FormField, SiteForm } from "@/types/api";

const initial: SubmitState = {};

/**
 * An editor-built form, rendered from its stored definition.
 *
 * The definition decides what appears; the API decides what is accepted. This
 * component renders `required` and `type` because they make the form pleasant
 * to fill in, not because they protect anything — a browser's validation is a
 * courtesy to the person typing and is absent for anything that posts
 * directly.
 *
 * On success the fields are replaced by the confirmation rather than being
 * cleared and left in place: a form that empties itself looks like it lost the
 * message, which is the moment people send it a second time.
 *
 * ## One `<form>`, whatever the definition asks for
 *
 * Conditions and steps both *hide* parts of this form and neither ever
 * unmounts one. A hidden step's controls still post — it is one submission —
 * and an unmounted control posts nothing, which is the bug that once dropped
 * posts from the sitemap when a panel was collapsed. So a step that is not
 * showing carries the `hidden` attribute, and a field its condition hides
 * carries `hidden` **and** has its controls `disabled`: the first is what the
 * visitor sees, the second is what keeps it out of the submission and out of
 * the browser's own "this is required".
 *
 * ## Without JavaScript
 *
 * The server's HTML is the whole form: every step one under another with its
 * title as a heading, every conditional field showing and none of them
 * `required`, and one submit button. That posts through the same Server
 * Action, and the API — which validates from the stored definition and drops
 * a field its condition hides — is the only judge there is.
 *
 * ## First paint, with JavaScript
 *
 * Hydration then narrows that to the first step and the fields whose
 * conditions hold. So the page does not draw the long form and collapse it a
 * moment later, the parts hydration is about to hide are marked
 * `data-form-wait` and the parts it is about to show `data-form-js`, and
 * `globals.css` holds them in their after-hydration state while a script-
 * capable browser waits — for four seconds, after which the whole form is
 * back, so a page whose script never arrives is still a form somebody can
 * send. Both attributes are gone from the first hydrated render.
 *
 * ## Steps
 *
 * The one button is always the form's submit button, and that is the whole
 * of the wizard's wiring: on a step that is not the last it reads "Next",
 * and the submit handler checks that step's controls with the browser's own
 * validation and moves on instead of sending. Enter in a field does the same
 * thing by the same path. The check is each control's `reportValidity()`, so
 * the message is the browser's, in the visitor's language, on the field it
 * is about. A step whose every field is hidden by a condition is skipped and
 * left out of the count.
 */
export function FormBlock({
  form, className, headingLevel = 3, embedded = false,
}: {
  form: SiteForm;
  className?: string;
  /**
   * The level of the headings this form draws — a `heading` field, a step's
   * title. A form sits under a section's `h2` nearly everywhere, hence 3;
   * pass 2 where nothing above it is an `h2` (the embed frame, a form
   * dropped into a body), or the page skips a level.
   */
  headingLevel?: HeadingLevel;
  /** Inside `/embed/forms/{slug}`: never navigate the frame after a success. */
  embedded?: boolean;
}) {
  const fields = useMemo(() => form.fields ?? [], [form.fields]);
  const groups = useMemo(() => stepsOf(fields), [fields]);
  const address = addressFieldsIn(fields);
  // The API says whether the form posts as multipart; the fields say the same
  // thing for a response from before it did.
  const takesFiles = form.has_files ?? fields.some((f) => f.kind === "file");

  const action = submitFormAction.bind(null, form.slug, embedded, takesFiles);
  const [state, formAction, pending] = useActionState(action, initial);

  const hydrated = useHydrated();
  const [watch, attachWatch] = useFormWatch();
  const hidden = useHiddenFields(watch, fields);

  /*
    `<Form>` writes the submitted values back after a refusal, from an effect
    of its own and without an event — so the conditions are asked to read the
    controls again once it has. A child's effect runs before its parent's,
    which is the order this needs.
  */
  useEffect(() => {
    watch.refresh();
  }, [state, watch]);

  /* ----------------------------------------------------------------- steps */

  const stepped = groups.length > 1;
  const wizard = stepped && hydrated;

  // The steps with something on them. A step emptied by its fields'
  // conditions is passed over; if that were somehow all of them, none is.
  const live = useMemo(() => {
    const shown = groups
      .map((group, i) => (group.fields.some(({ field }) => field.kind !== "hidden" && !hidden.has(field.name)) ? i : -1))
      .filter((i) => i >= 0);
    return shown.length ? shown : groups.map((_, i) => i);
  }, [groups, hidden]);

  /*
    Where the visitor is, and the action state they were there under.

    A refusal naming a field on an earlier step has to bring that step back,
    or the form says "could not send that" over a page where nothing is
    wrong. Keeping the state beside the step makes that a derivation rather
    than an effect: until the visitor moves again, a new state with field
    errors *is* the step to show.
  */
  const [nav, setNav] = useState<{ step: number; under: SubmitState; touched: boolean }>(
    { step: 0, under: state, touched: false },
  );
  const errorStep = groups.findIndex((group) =>
    group.fields.some(({ field }) => errorFor(state.fieldErrors, field.name) !== undefined));
  const asked = nav.under === state || errorStep < 0 ? nav.step : errorStep;
  // Never a skipped step: the nearest live one at or before it, else the first.
  const current = live.includes(asked) ? asked : live.filter((i) => i <= asked).pop() ?? live[0];
  const position = live.indexOf(current);
  const isLast = position === live.length - 1;

  const moved = useRef(false);
  const go = (step: number) => {
    moved.current = true;
    setNav({ step, under: state, touched: true });
  };

  // Moving between steps puts focus on the new step's heading, so a keyboard
  // or screen-reader user lands at the top of it and hears where they are.
  // Only after a move — never on mount, and not when a refusal changes the
  // step, where focus belongs with the error that says why.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const title = watch.form()?.querySelector<HTMLElement>(`[data-form-step="${current}"] [data-form-step-title]`);
    if (!title) return;
    // Focus without the browser's own scroll, then scroll by rule: a focused
    // element is brought only just into view, which under the site's sticky
    // header is behind it (7px from the top of a 390px screen, measured).
    // `scrollIntoView` honours the title's `scroll-margin-top` in globals.css.
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: "start" });
  }, [current, watch]);

  const onSubmit: ComponentProps<"form">["onSubmit"] = (event) => {
    // A one-page form is sent as it is and the API answers for it, as ever.
    if (!wizard) return;

    if (!stepIsValid(event.currentTarget, current)) {
      event.preventDefault();
      return;
    }

    if (!isLast) {
      event.preventDefault();
      go(live[position + 1]);
    }
  };

  /* --------------------------------------------------------------- success */

  if (state.ok) {
    return (
      <div className={className}>
        {/* Not dismissible when it carries the way onward — closing it would leave nothing. */}
        <Alert tone="ok" title="Message sent" dismissible={!state.redirectUrl}>
          {state.message}
          {state.redirectUrl && (
            /*
              Only the embed frame gets here with a target (everywhere else
              the action has already redirected). `_top`, so it is the
              visitor's own press that leaves the host's page, in the whole
              window — never this frame quietly becoming a third site inside
              somebody else's layout.
            */
            <span className="mt-2 block">
              <a href={state.redirectUrl} target="_top" rel="noopener noreferrer" className="font-semibold underline">
                Continue
              </a>
            </span>
          )}
        </Alert>
      </div>
    );
  }

  const submitLabel = form.submit_label || "Send";
  const Heading = `h${headingLevel}` as const;

  return (
    <Form action={formAction} state={state} onSubmit={onSubmit} className={className} noValidate>
      {state.error && (
        <Alert tone="err" title="Could not send that">
          {state.error}
          {/*
            The one thing `<Form>` cannot put back: a browser will not let
            script set a file input, so a refused form has genuinely lost the
            choice and has to say so rather than look attached.
          */}
          {takesFiles && " Everything you typed is still here, but a file you attached has to be chosen again."}
        </Alert>
      )}

      {/*
        The spam trap. Off-screen rather than `display:none` — some bots skip
        hidden inputs — and `aria-hidden` with `tabIndex={-1}` so it is not
        announced and cannot be tabbed into by a person. `autoComplete="off"`
        stops a browser helpfully filling it in and failing a real visitor.
      */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${form.slug}-website`}>Leave this field empty</label>
        <input id={`${form.slug}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {/*
        Which page this form was embedded in. It travels with the answers and
        is read off the request rather than out of them: `FormValidator` drops
        every key the form does not declare, so anything treated as an answer
        here would be discarded before it reached the lead.
      */}
      <PageContextFields />

      {/*
        Where the visitor is in a stepped form. Only meaningful once the
        steps are one at a time, so it is `data-form-js` until then, and the
        bar is `scale`, never `width`.

        The announcement is a region of its own: mounted empty and kept
        mounted, because a live region that appears with its words already in
        it has not *changed* and is not read. It says nothing until the
        visitor has moved, then says the count politely while focus — on the
        step's heading — says the title.
      */}
      {stepped && (
        <p className="sr-only" role="status">
          {nav.touched ? `Step ${position + 1} of ${live.length}` : ""}
        </p>
      )}
      {stepped && (
        <div className="mb-5" data-form-js={hydrated ? undefined : ""}>
          <p className="mb-2 text-12-5 font-semibold text-muted" aria-hidden="true">
            Step {position + 1} of {live.length}
          </p>
          <div
            role="progressbar"
            aria-label="Progress through this form"
            aria-valuemin={1}
            aria-valuemax={live.length}
            aria-valuenow={position + 1}
            aria-valuetext={`Step ${position + 1} of ${live.length}`}
            className="h-1.5 overflow-hidden rounded-full bg-muted/25"
          >
            <span
              className="block h-full origin-left rounded-full bg-brand-600 transition-[scale] duration-(--duration-base) ease-brand"
              style={{ scale: `${(position + 1) / live.length} 1` }}
            />
          </div>
        </div>
      )}

      {/* The watch finds the `<form>` from here; `<Form>` owns the form's own ref. */}
      <div ref={attachWatch}>
        {groups.map((group, index) => {
          // The first page has no break before it, so it is titled with the
          // form's own name; an untitled later one says which step it is.
          const title = group.title ?? (stepped ? (index === 0 ? form.name : `Step ${index + 1}`) : null);

          return (
            <div
              key={index}
              data-form-step={index}
              hidden={wizard && index !== current}
              data-form-wait={stepped && !hydrated && index !== current ? "" : undefined}
            >
              {title && (
                <Heading
                  tabIndex={-1}
                  data-form-step-title
                  className={cn("mb-4 text-17 font-semibold text-ink outline-none [overflow-wrap:anywhere]", index > 0 && !wizard && "mt-2")}
                >
                  {title}
                </Heading>
              )}

              <div className="grid gap-x-4 sm:grid-cols-2">
                {group.fields.map(({ field, index: at }) => (
                  <FormControl
                    key={`${at}-${field.name}`}
                    field={field}
                    slug={form.slug}
                    error={errorFor(state.fieldErrors, field.name)}
                    hydrated={hydrated}
                    off={hidden.has(field.name)}
                    headingLevel={headingLevel}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/*
        A form asking for a PIN code fills in whatever else it asks for from
        it. Rendered after the grid rather than beside the PIN code field,
        because the editor decides the order of their own form and this has no
        business rearranging it — the message reads the same wherever the field
        happens to be, and the city suggestions attach themselves.
      */}
      {address && <PincodeAutofill names={address} />}

      <div className="flex flex-wrap items-center gap-3">
        {wizard && position > 0 && (
          <Button type="button" variant="secondary" onClick={() => go(live[position - 1])} disabled={pending}>
            Back
          </Button>
        )}

        <Button type="submit" pending={pending}>
          {pending ? "Sending…" : wizard ? (isLast ? submitLabel : "Next") : stepped ? (
            // Before hydration a stepped form's button says both, and the
            // stylesheet picks: "Next" where the steps are about to be one at
            // a time, the submit label where the whole form is on the page.
            <>
              <span data-form-js="">Next</span>
              <span data-form-wait="">{submitLabel}</span>
            </>
          ) : submitLabel}
        </Button>
      </div>
    </Form>
  );
}

/**
 * Whether the controls on one step are ready to be left.
 *
 * The browser's own validity, control by control, stopping at the first that
 * is not: `reportValidity()` focuses it and says what is wrong in the
 * visitor's language. A control its condition has disabled does not validate
 * at all (`willValidate` is false), so a hidden field cannot hold anybody on
 * a step. The one thing HTML cannot express is "at least one of these
 * checkboxes"; a required group is asked directly, with the message on its
 * first box, and cleared again the moment one is ticked.
 */
function stepIsValid(form: HTMLFormElement, step: number): boolean {
  const panel = form.querySelector(`[data-form-step="${step}"]`);
  if (!panel) return true;

  for (const group of panel.querySelectorAll('fieldset[data-form-group="required"]')) {
    const boxes = Array.from(group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    boxes.forEach((box) => box.setCustomValidity(""));
    if (boxes.length && !boxes.some((box) => box.checked)) boxes[0].setCustomValidity("Choose at least one of these.");
  }

  for (const control of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (!control.willValidate) continue;
    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }

  return true;
}

/**
 * The address fields in an editor-built form, if it has any.
 *
 * Editors name things themselves, so this asks the form what it is holding
 * rather than requiring a particular shape. A PIN code plus at least one of
 * country, state or city is enough to be worth filling in; anything less is a
 * form that merely happens to ask for a post code, and wiring a lookup to it
 * would be this component deciding what somebody else's form is for.
 *
 * The field order is left exactly as the editor arranged it. Moving the PIN
 * code to the top would be right for the checkout, which is designed around
 * it, and presumptuous here — the form on the screen is somebody's own.
 */
function addressFieldsIn(fields: FormField[]): PincodeFieldNames | null {
  const has = (...aliases: string[]) => aliases.find((a) => fields.some((f) => f.name === a));

  const pin = has("pincode", "pin_code", "pin", "postal_code", "postcode");
  if (!pin) return null;

  const country = has("country");
  const state = has("state");
  const city = has("city", "town");
  if (!country && !state && !city) return null;

  return { pin, country, state, city };
}
