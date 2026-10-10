"use client";

import { useActionState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/admin/form-actions";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { ClearSecretButton } from "./clear-secret-button";
import { Tabs } from "@/components/admin/tabs";
import { ThemePicker } from "./theme-picker";
import { MotionPicker } from "./motion-picker";
import { LoginPicker } from "./login-picker";
import { StatsField } from "./stats-field";
import { LinesField } from "./lines-field";
import { MailPanel } from "./mail-panel";
import { TicketsPanel } from "./tickets-panel";
import { DocumentField } from "@/components/admin/document-field";
import { EditorField } from "@/components/admin/editor-field";
import { PaymentsPanel } from "./payments-panel";
import { BannersPanel } from "./banners-panel";
import { HunterTest } from "./hunter-test";
import { OpenRouterTest } from "./openrouter-test";
import { GscTest } from "./gsc-test";
import { Ga4Test } from "./ga4-test";
import { saveSettingsAction, type SettingsFormState } from "./actions";
import {
  GROUP_TITLES, HIDDEN, LABELS, STANDALONE_GROUPS, SYSTEM_SCREEN, orderFields, screenFor, sectionFor, type SettingsScreen,
} from "./settings-copy";
import { ChoiceField, onOffNotes, ServerLimits, SettingColourField, SettingSwitchField } from "./settings-fields";
import type { PaymentsMeta, SettingGroups, UploadLimits } from "@/lib/admin";
import type { BackupDriveStatus, InboundMailStatus, MailStatus, MessagingStatus } from "@/types/api";
import { MessagingPanel } from "./messaging-panel";
import { MediaCdnTest } from "./media-cdn-test";
import { BackupDestinationPanel } from "./backup-destination-panel";
import { MeetingsGooglePanel } from "./meetings-google-panel";
import { GoogleLoginNote } from "./google-login-note";
import type { MeetingsGoogleStatus } from "@/types/meetings";
import { ZohoBooksPanel } from "./zoho-books-panel";
import { ShiprocketPanel } from "./shiprocket-panel";
import type { ShiprocketStatus } from "@/types/courier";
import type { ZohoBooksStatus } from "@/types/zoho";

const initial: SettingsFormState = {};

export function SettingsForm({
  screen, groups, uploads, payments, mail, inbound, messaging, drive, meetingsGoogle, zoho, shiprocket,
}: {
  screen: SettingsScreen;
  groups: SettingGroups;
  uploads: UploadLimits;
  payments: PaymentsMeta;
  /** Only the System screen draws the mail panel; see `SettingsScreen.needs`. */
  mail?: MailStatus;
  /** Only Tickets → Email to ticket draws the mailbox panel. */
  inbound?: InboundMailStatus;
  /** Only Messaging → Settings draws the channels panel. */
  messaging?: MessagingStatus;
  /** Only Backup settings draws the Drive connection. */
  drive?: BackupDriveStatus;
  /** Only Meeting settings draws the Google Calendar connection. */
  meetingsGoogle?: MeetingsGoogleStatus;
  /** Only Store settings draws the Zoho Books connection. */
  zoho?: ZohoBooksStatus;
  /** Only Store settings draws the Shiprocket connection. */
  shiprocket?: ShiprocketStatus;
}) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);

  /*
    The groups this screen draws, in the order `SCREENS` lists them, minus
    any the API did not return. The System screen also picks up whatever the
    API returned that no screen names and no standalone form owns — under
    "Other", so a new seeder group is visible somewhere rather than nowhere,
    and `SettingsScreensTest` fails it by name.
  */
  const drawn = screen.sections.flatMap((x) => x.groups).filter((g) => groups[g]);
  if (screen.path === SYSTEM_SCREEN) {
    for (const g of Object.keys(groups)) {
      if (!screenFor(g) && !STANDALONE_GROUPS.has(g)) drawn.push(g);
    }
  }

  const panel = (group: string) => (
    <GroupPanel key={group} group={group} rows={groups[group]} uploads={uploads} payments={payments} mail={mail} inbound={inbound} messaging={messaging} drive={drive} meetingsGoogle={meetingsGoogle} zoho={zoho} shiprocket={shiprocket} />
  );

  return (
    <Form action={formAction} state={state} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title={`${screen.title} saved`}>The site picks these up immediately.</Alert>
      )}

      {/*
        One tab per group. Every panel stays mounted — see Tabs — because
        this is a single form and a hidden-by-unmounting panel would take its
        inputs out of the submission. Saving from the General tab would wipe
        every field on the other tabs.

        A screen with one group draws no strip at all: a strip of one tab is
        chrome that says nothing, and `#setting__<key>` scrolls just the same.
      */}
      {drawn.length > 1 ? (
        <Tabs
          tabs={drawn.map((group) => ({
            id: group,
            label: (GROUP_TITLES[group] ?? { title: group }).title,
            section: sectionFor(group) ?? (screen.path === SYSTEM_SCREEN ? "Other" : undefined),
          }))}
        >
          {drawn.map(panel)}
        </Tabs>
      ) : (
        drawn.map(panel)
      )}

      {/*
        `FormActions`, like every admin form: pinned to the bottom while the
        form is taller than the screen, Ctrl/⌘ S, and the leave guard. One
        Save covers the whole form, and the note says so on a tabbed screen,
        where a button that appeared to belong to the visible tab would imply
        the others were not being saved.
      */}
      <FormActions>
        <Button type="submit" pending={pending}>
          {pending ? "Saving…" : screen.saveLabel}
        </Button>
        {drawn.length > 1 && <span className="text-12-5 text-muted">Saves every tab, not just this one.</span>}
      </FormActions>
    </Form>
  );
}

/**
 * One settings group: its blurb, the panel that draws the whole group where
 * the generic grid cannot (mail, the support mailbox, payments, banners), and
 * otherwise the grid of fields with the per-key specials. Unchanged from when
 * it was inline in the one settings form; it is a component so ten screens
 * can draw a group the same way.
 */
function GroupPanel({
  group, rows, uploads, payments, mail, inbound, messaging, drive, meetingsGoogle, zoho, shiprocket,
}: {
  group: string;
  rows: SettingGroups[string];
  uploads: UploadLimits;
  payments: PaymentsMeta;
  mail?: MailStatus;
  inbound?: InboundMailStatus;
  messaging?: MessagingStatus;
  drive?: BackupDriveStatus;
  meetingsGoogle?: MeetingsGoogleStatus;
  zoho?: ZohoBooksStatus;
  shiprocket?: ShiprocketStatus;
}) {
  const meta = GROUP_TITLES[group] ?? { title: group, blurb: "" };

  return (
    <section>
      {meta.blurb && <p className="measure mb-4 text-13 text-muted">{meta.blurb}</p>}

      {/*
        Mail is the one group the generic renderer cannot draw. Which
        fields exist depends on the transport chosen, and it carries
        two buttons that do not save anything — so it gets a panel of
        its own rather than a special case per field here. The rows
        still come from the same API response, and the `setting__`
        names still mean it saves through the same action.
      */}
      {group === "mail" && mail && <MailPanel status={mail} rows={rows} />}

      {/*
        The support mailbox, for the same reason: which fields exist
        depends on the provider, and the panel carries a consent
        button, a check button and the log of what was read.
      */}
      {group === "tickets" && inbound && <TicketsPanel status={inbound} rows={rows} />}

      {/*
        Messaging channels: a provider per channel decides which fields
        exist, and each channel carries its webhook URL and a test.
      */}
      {group === "messaging" && messaging && <MessagingPanel status={messaging} rows={rows} />}

      {/*
        Payments, like mail, cannot be drawn by the generic renderer:
        which fields exist depends on the gateway chosen, and the panel
        carries the webhook URL, which is not a setting at all.
      */}
      {group === "payments" && <PaymentsPanel meta={payments} rows={rows} />}

      {/*
        Banners, for the third time the same reason: nine image
        pickers and a one-character switch cannot be flowed into the
        generic two-column grid without the switch taking a
        picker-sized cell and every row standing as tall as its
        taller half.
      */}
      {group === "banners" && <BannersPanel rows={rows} />}

      {/* What the server will actually accept, above the field that
          asks for a number. Read before typing, not after saving. */}
      {group === "media" && <ServerLimits uploads={uploads} />}

      <div className="grid gap-x-5 sm:grid-cols-2">
        {/* MailPanel renders the whole mail group itself: which fields
            exist depends on the transport, which is not something a
            flat list can say. */}
        {(group === "mail" || group === "tickets" || group === "payments" || group === "banners" || group === "messaging"
          ? []
          : orderFields(group, rows)
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
            return <ThemePicker key={row.key} name={id} rows={rows} />;
          }
          if (row.key.startsWith("theme_")) {
            return null;
          }
          // A company's own fonts are files, written by their own panel
          // inside the picker (`CustomFontsPanel`). Drawn here they would be
          // bare text inputs holding storage paths — and posting them is
          // refused by the API, which fails the whole tab's save.
          if (row.key.startsWith("custom_font_")) {
            return null;
          }
          // The Motion tab is one picker for the same reason.
          if (row.key === "motion_reveal") {
            return <MotionPicker key={row.key} rows={rows} />;
          }
          if (row.key.startsWith("motion_")) {
            return null;
          }
          // The Sign-in screen tab: one picker for the backdrop, its
          // intensity and its speed. The image row stays a CoverField
          // below it, rendered by the generic `_path` branch.
          if (row.key === "login_backdrop") {
            return <LoginPicker key={row.key} rows={rows} />;
          }
          if (row.key === "login_intensity" || row.key === "login_speed") {
            return null;
          }
          // The two statistics rows are inputs per figure, composed
          // back into the stored `value|label|icon` lines.
          if (row.key === "hero_stats" || row.key === "support_stats") {
            return (
              <StatsField
                key={row.key}
                name={id}
                label={meta.label}
                hint={meta.hint}
                defaultValue={row.value ?? ""}
                subject={row.key === "hero_stats" ? "hero statistic" : "support statistic"}
              />
            );
          }
          // The "Why Technoware" block's two lists, the same way: the steps
          // as `title|body` rows, the AMC inclusions one per row.
          if (row.key === "why_steps") {
            return (
              <LinesField
                key={row.key}
                name={id}
                label={meta.label}
                hint={meta.hint}
                defaultValue={row.value ?? ""}
                subject="step"
                columns={[
                  { key: "title", label: "Title", placeholder: "Assess before we quote" },
                  { key: "body", label: "Text", multiline: true },
                ]}
                addLabel="Add a step"
              />
            );
          }
          if (row.key === "amc_inclusions") {
            return (
              <LinesField
                key={row.key}
                name={id}
                label={meta.label}
                hint={meta.hint}
                defaultValue={row.value ?? ""}
                subject="inclusion"
                columns={[{ key: "item", label: "Item", placeholder: "Scheduled preventive site visits" }]}
                addLabel="Add an item"
              />
            );
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
          // A colour with no fixed choices: the picker beside the hex.
          // `chatbot_background` is a colour under a name that does not say so.
          if ((row.key.endsWith("_colour") || row.key === "chatbot_background") && !row.options?.length) {
            return (
              <SettingColourField key={row.key} id={id} label={meta.label} hint={meta.hint} defaultValue={row.value ?? ""} />
            );
          }

          // An Off and an On, whatever the row is called: a switch, with the
          // API's own sentence for the state it is in underneath.
          const onOff = onOffNotes(row.options);
          if (onOff) {
            return (
              <SettingSwitchField key={row.key} id={id} label={meta.label} hint={meta.hint} defaultValue={row.value} notes={onOff} />
            );
          }

          if (row.options?.length) {
            const choice = (
              <ChoiceField
                key={row.key}
                id={id}
                label={meta.label}
                value={row.value}
                options={row.options}
              />
            );

            // "Test this model" stands directly under the second of the two
            // model pickers, not at the foot of the tab under Search Console.
            return row.key === "seo_ai_model"
              ? [choice, <OpenRouterTest key="openrouter-test" configured={rows.some((r) => r.key === "openrouter_api_key" && Boolean(r.is_set))} />]
              : choice;
          }

          // An on/off setting with no named choices: a switch, decided by
          // the row's seeded `type` — see SettingSwitchField.
          if (row.type === "boolean") {
            return (
              <SettingSwitchField key={row.key} id={id} label={meta.label} hint={meta.hint} defaultValue={row.value} />
            );
          }

          /*
            Rich text, so it gets the editor rather than a textarea.

            It is rendered into an email and, through the order page,
            into a browser - and the person writing it is writing a
            numbered list with a link in it, which is exactly what a
            plain textarea cannot express.
          */
          if (row.key === "activation_procedure" || row.key === "login_message" || row.key === "coming_soon_message") {
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

          /*
            A secret that spans lines — an SSH private key, a service
            account's JSON — cannot go in a password input: a browser strips
            the line breaks out of an <input>'s value, and a PEM key without
            them is a key nothing can read. A textarea keeps them, and like
            the password input it is never given the stored value.
          */
          if (row.is_secret && row.type === "text") {
            return (
              <div key={row.key} className="sm:col-span-2">
                <Field
                  label={meta.label}
                  htmlFor={id}
                  hint={row.is_set ? "A value is saved. Leave blank to keep it, or paste a new one to replace it." : meta.hint}
                >
                  <Textarea
                    id={id}
                    name={id}
                    rows={4}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-12-5"
                    placeholder={row.is_set ? "(saved)" : meta.placeholder}
                  />
                </Field>
                {row.is_set && <ClearSecretButton settingKey={row.key} label={meta.label} />}
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
        {/* The media CDN: prove the saved address before switching it on. */}
        {group === "media_cdn" && <MediaCdnTest configured={Boolean(rows.find((r) => r.key === "media_cdn_url")?.value)} />}

        {/* A backup destination's test, last refusal and its own extras (Drive's consent, SFTP's key). */}
        {group.startsWith("backups_") && <BackupDestinationPanel group={group} rows={rows} drive={drive} />}

        {/* The Workspace calendar every meeting is organised on: its consent, a test, the last refusal. */}
        {group === "meetings_google" && <MeetingsGooglePanel status={meetingsGoogle} rows={rows} />}

        {/* Zoho Books: its consent, the organisation and taxes only Zoho can list, a test, where things stand. */}
        {group === "zoho_books" && <ZohoBooksPanel status={zoho} rows={rows} />}

        {/* Shiprocket: the pickup location only it can list, the tracking address to paste into it, a test, where things stand. */}
        {group === "shiprocket" && <ShiprocketPanel status={shiprocket} rows={rows} />}

        {/* Customers' "Continue with Google": the redirect address to register with Google, and whether it is live. */}
        {group === "google_login" && (
          <GoogleLoginNote
            enabled={["1", "true"].includes(String(rows.find((r) => r.key === "google_login_enabled")?.value ?? ""))}
            hasId={Boolean(rows.find((r) => r.key === "google_login_client_id")?.value)}
            hasSecret={rows.some((r) => r.key === "google_login_client_secret" && Boolean(r.is_set))}
          />
        )}

        {group === "integrations" && (
          <>
            <HunterTest configured={rows.some((r) => r.key === "hunter_api_key" && Boolean(r.is_set))} />
            <GscTest
              configured={rows.some((r) => r.key === "gsc_service_account" && Boolean(r.is_set))}
              lastError={rows.find((r) => r.key === "gsc_error")?.value ?? null}
            />
            <Ga4Test
              configured={
                rows.some((r) => r.key === "gsc_service_account" && Boolean(r.is_set))
                && Boolean(rows.find((r) => r.key === "ga4_property_id")?.value)
              }
              lastError={rows.find((r) => r.key === "ga4_error")?.value ?? null}
            />
          </>
        )}
      </div>
    </section>
  );
}
