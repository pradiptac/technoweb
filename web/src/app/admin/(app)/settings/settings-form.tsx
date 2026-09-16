"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { ClearSecretButton } from "./clear-secret-button";
import { Tabs } from "@/components/admin/tabs";
import { ThemePicker } from "./theme-picker";
import { MotionPicker } from "./motion-picker";
import { MailPanel } from "./mail-panel";
import { DocumentField } from "@/components/admin/document-field";
import { EditorField } from "@/components/admin/editor-field";
import { PaymentsPanel } from "./payments-panel";
import { BannersPanel } from "./banners-panel";
import { HunterTest } from "./hunter-test";
import { saveSettingsAction, type SettingsFormState } from "./actions";
import { GROUP_TITLES, HIDDEN, LABELS, ORDER, STANDALONE_GROUPS, orderFields, sectionFor } from "./settings-copy";
import { ChoiceField, ServerLimits } from "./settings-fields";
import type { PaymentsMeta, SettingGroups, UploadLimits } from "@/lib/admin";
import type { MailStatus } from "@/types/api";

const initial: SettingsFormState = {};

export function SettingsForm({
  groups, uploads, mail, payments,
}: {
  groups: SettingGroups;
  uploads: UploadLimits;
  mail: MailStatus;
  payments: PaymentsMeta;
}) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);

  // The info bar and the themes have screens of their own under Site; their
  // groups are fetched with the rest and drawn there. See STANDALONE_GROUPS.
  const sorted = Object.keys(groups).filter((g) => !STANDALONE_GROUPS.has(g)).sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Settings saved">The site picks these up immediately.</Alert>
      )}

      {/*
        One tab per group. All nine panels stay mounted — see Tabs — because
        this is a single form and a hidden-by-unmounting panel would take its
        inputs out of the submission. Saving from the General tab would wipe
        every field on the other eight.
      */}
      <Tabs
        tabs={sorted.map((group) => ({
          id: group,
          label: (GROUP_TITLES[group] ?? { title: group }).title,
          section: sectionFor(group),
        }))}
      >
        {sorted.map((group) => {
          const meta = GROUP_TITLES[group] ?? { title: group, blurb: "" };

          return (
            <section key={group}>
              {meta.blurb && <p className="measure mb-4 text-13 text-muted">{meta.blurb}</p>}

              {/*
                Mail is the one group the generic renderer cannot draw. Which
                fields exist depends on the transport chosen, and it carries
                two buttons that do not save anything — so it gets a panel of
                its own rather than a special case per field here. The rows
                still come from the same API response, and the `setting__`
                names still mean it saves through the same action.
              */}
              {group === "mail" && <MailPanel status={mail} rows={groups.mail} />}

              {/*
                Payments, like mail, cannot be drawn by the generic renderer:
                which fields exist depends on the gateway chosen, and the panel
                carries the webhook URL, which is not a setting at all.
              */}
              {group === "payments" && <PaymentsPanel meta={payments} rows={groups.payments} />}

              {/*
                Banners, for the third time the same reason: nine image
                pickers and a one-character switch cannot be flowed into the
                generic two-column grid without the switch taking a
                picker-sized cell and every row standing as tall as its
                taller half.
              */}
              {group === "banners" && <BannersPanel rows={groups.banners} />}

              {/* What the server will actually accept, above the field that
                  asks for a number. Read before typing, not after saving. */}
              {group === "media" && <ServerLimits uploads={uploads} />}

              <div className="grid gap-x-5 sm:grid-cols-2">
                {/* MailPanel renders the whole mail group itself: which fields
                    exist depends on the transport, which is not something a
                    flat list can say. */}
                {(group === "mail" || group === "payments" || group === "banners"
                  ? []
                  : orderFields(group, groups[group])
                ).map((row) => {
                  const meta = LABELS[row.key] ?? { label: row.key };
                  const id = `setting__${row.key}`;
                  const isLong = row.type === "text";

                  if (HIDDEN.has(row.key)) {
                    return null;
                  }

                  // The appearance group is one control: the theme radios,
                  // the five colours and the two fonts all live in the
                  // picker, which posts them under their own setting names.
                  // The companion rows are skipped here so they are not
                  // rendered a second time as bare text inputs.
                  if (row.key === "theme") {
                    return <ThemePicker key={row.key} name={id} rows={groups[group]} />;
                  }
                  if (row.key.startsWith("theme_")) {
                    return null;
                  }
                  // The Motion tab is one picker for the same reason.
                  if (row.key === "motion_reveal") {
                    return <MotionPicker key={row.key} rows={groups[group]} />;
                  }
                  if (row.key.startsWith("motion_")) {
                    return null;
                  }

                  /*
                    A setting the API says has a fixed set of choices.

                    Driven by `row.options` rather than by the key, so the next
                    one of these needs nothing here — and the labels and the
                    descriptions come from the enum that already owns them
                    rather than being retyped on this side of the wire.

                    Rendered as a select rather than the slider the design
                    shows: five named steps is a list, and a slider implies a
                    continuum between them that does not exist. The chosen
                    option's description sits underneath, because "Good" and
                    "High" mean nothing without it.
                  */
                  if (row.options?.length) {
                    return (
                      <ChoiceField
                        key={row.key}
                        id={id}
                        label={meta.label}
                        value={row.value}
                        options={row.options}
                      />
                    );
                  }

                  /*
                    Rich text, so it gets the editor rather than a textarea.

                    It is rendered into an email and, through the order page,
                    into a browser - and the person writing it is writing a
                    numbered list with a link in it, which is exactly what a
                    plain textarea cannot express.
                  */
                  if (row.key === "activation_procedure") {
                    return (
                      <div key={row.key} className="sm:col-span-2">
                        <EditorField
                          name={id}
                          label={meta.label}
                          defaultValue={row.value ?? ""}
                        />
                      </div>
                    );
                  }

                  /*
                    A document, not an image - and it ends in `_path`, so
                    without this it falls into the branch below and is offered
                    an image picker for a PDF.
                  */
                  if (row.key === "activation_pdf_path") {
                    return (
                      <div key={row.key} className="sm:col-span-2">
                        <DocumentField
                          name={id}
                          label={meta.label}
                          hint={meta.hint}
                          defaultPath={row.value}
                        />
                      </div>
                    );
                  }

                  // Logo and favicon are files, not text. CoverField uploads
                  // to the media library and puts the returned path in a
                  // hidden input, which is exactly what the setting stores.
                  if (row.key.endsWith("_path")) {
                    /*
                      All three sit in the grid, one column each.

                      The sign-in image used to span both, on the grounds that a
                      wide photograph previewed in half a column is too small to
                      judge. That reason went when the previews were capped at
                      200px and centred: every one of them is now the same size
                      whatever column it is in, so spanning bought nothing but an
                      uneven row. The logo and the favicon were always a pair —
                      the same mark at two sizes, and the question being answered
                      is whether they match, which needs them side by side.
                    */
                    return (
                      <div key={row.key}>
                        <CoverField
                          name={id}
                          label={meta.label}
                          defaultPath={row.value}
                          defaultUrl={row.url ?? null}
                          /*
                            A banner is wide and a logo is not, so the uploader's
                            own advice cannot be the same for both — the shared
                            default says "around 1200 x 800", which for a page
                            banner is the wrong shape and half the width it will
                            be painted at. Two hints saying different things
                            about one file is worse than one saying nothing.
                          */
                          /*
                            The explanation sits under the label, inside the
                            control. It used to be a paragraph rendered after
                            the whole field with a `-mt-3` dragging it back up,
                            so the sentence about a picture came below the
                            picture, the drop zone and both action links.
                          */
                          description={meta.hint}
                          /*
                            `contain`, not `cover`. Each of these is a mark
                            rather than a photograph: cropping a 600x81 logo into
                            an 80px strip shows the middle third of a wordmark,
                            and the file decides its own ratio because a client
                            uploaded it.
                          */
                        />
                        {meta.hint && <p className="-mt-3 mb-4 text-12-5 text-faint">{meta.hint}</p>}
                      </div>
                    );
                  }

                  if (row.is_secret) {
                    return (
                      <div key={row.key}>
                        <Field
                          label={meta.label}
                          htmlFor={id}
                          hint={row.is_set
                            ? "A value is saved. Leave blank to keep it, or type a new one to replace it."
                            : meta.hint}
                        >
                          <Input
                            id={id}
                            name={id}
                            type="password"
                            autoComplete="new-password"
                            // No defaultValue: the API does not send one back,
                            // and a real credential must never sit in the DOM.
                            placeholder={row.is_set ? "••••••••  (saved)" : meta.placeholder}
                          />
                        </Field>
                        {row.is_set && <ClearSecretButton settingKey={row.key} label={meta.label} />}
                      </div>
                    );
                  }

                  return (
                    <div key={row.key} className={isLong ? "sm:col-span-2" : undefined}>
                      <Field label={meta.label} htmlFor={id} hint={meta.hint}>
                        {isLong ? (
                          <Textarea id={id} name={id} rows={3} defaultValue={row.value ?? ""}
                            placeholder={meta.placeholder} />
                        ) : (
                          <Input id={id} name={id} defaultValue={row.value ?? ""}
                            placeholder={meta.placeholder}
                            inputMode={row.key.startsWith("social_") ? "url" : undefined} />
                        )}
                      </Field>
                    </div>
                  );
                })}

                {/*
                  One button under the two secrets rather than a panel of its
                  own: the generic rows draw a key correctly, and what was
                  missing was a way to prove it works.
                */}
                {group === "integrations" && (
                  <HunterTest configured={(groups.integrations ?? []).some((r) => r.key === "hunter_api_key" && Boolean(r.is_set))} />
                )}
              </div>
            </section>
          );
        })}
      </Tabs>

      {/* Outside the tabs on purpose: one Save covers the whole form, and a
          button that appeared to belong to the visible tab would imply the
          others were not being saved. */}
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <span className="text-12-5 text-muted">Saves every tab, not just this one.</span>
      </div>
    </Form>
  );
}
