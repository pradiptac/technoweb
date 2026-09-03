"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { ClearSecretButton } from "./clear-secret-button";
import { Tabs } from "@/components/admin/tabs";
import { ThemePicker } from "./theme-picker";
import { MailPanel } from "./mail-panel";
import { DocumentField } from "@/components/admin/document-field";
import { EditorField } from "@/components/admin/editor-field";
import { PaymentsPanel } from "./payments-panel";
import { saveSettingsAction, type SettingsFormState } from "./actions";
import type { PaymentsMeta, SettingGroups, UploadLimits } from "@/lib/admin";
import type { MailStatus } from "@/types/api";

const initial: SettingsFormState = {};

/** Human labels and hints, so the UI does not just show raw setting keys. */
const LABELS: Record<string, { label: string; hint?: string; placeholder?: string }> = {
  company_name: { label: "Company name" },
  activation_procedure: {
    label: "Default activation procedure",
    hint: "Sent by email the moment an activation code is issued, and shown beside the code on the order page. A product with its own procedure overrides this; a product left blank uses it.",
  },
  activation_pdf_path: {
    label: "Default activation document",
    hint: "A PDF attached to the same email — the vendor's guide or licence terms. Overridden per product in the same way.",
  },
  // The hint here comes from the chosen option's own description, which the
  // API sends — see ChoiceField. Only the label is needed.
  image_quality: { label: "Image quality" },
  media_max_kb: {
    label: "Maximum upload size (KB)",
    hint: "Images and documents. 5120 is 5 MB.",
  },
  media_max_video_kb: {
    label: "Maximum video size (KB)",
    hint: "MP4 and WebM only. 20480 is 20 MB.",
  },
  media_max_megapixels: {
    label: "Maximum image size (megapixels)",
    hint: "A separate limit from file size, and it has to be: a well-compressed image of enormous dimensions fits inside the size limit and still exhausts memory the moment anything resizes it. 50 is larger than any current camera produces.",
  },
  /*
    Each of these says the size it wants, because each is used at a different
    one and the file decides its own aspect ratio — the header reserved 180x40
    for a mark that turned out to be 600x81, and the navigation beside it
    jumped on every cold load until the real dimensions were read.
  */
  logo_path: {
    label: "Logo",
    hint: "PNG or SVG with a transparent background, around 600 x 80 px. Leave empty to use the TECHNOWARE wordmark.",
  },
  favicon_path: {
    label: "Favicon",
    hint: "The small icon in the browser tab. Square PNG or SVG, 512 x 512 px.",
  },
  login_image_path: {
    label: "Sign-in image",
    hint: "Shown beside the staff and customer login forms. A landscape photograph around 1600 x 1200 px; it is hidden on phones. Leave empty for a plain panel.",
  },
  newsletter_company: { label: "Sender name in the footer", hint: "Falls back to the company name above." },
  newsletter_from_name: { label: "From name", hint: "What a recipient sees in place of the address." },
  newsletter_from_email: { label: "From address", hint: "Must be on a domain whose SPF and DKIM records name your mail provider, or messages land in spam." },
  newsletter_reply_to: { label: "Reply-to", hint: "Where replies go. Worth setting to a monitored inbox — people do reply." },
  newsletter_address: {
    label: "Postal address",
    hint: "Goes in every footer. Required by anti-spam law in several countries, and a campaign without one is refused before it sends.",
  },
  newsletter_footer_text: { label: "Footer line", hint: "One sentence saying why they are receiving this." },
  newsletter_batch_size: { label: "Emails per batch", hint: "How many one background job sends. Lower it if your provider rate-limits." },
  newsletter_batch_delay: { label: "Seconds between batches", hint: "Zero sends as fast as the queue allows." },
  newsletter_tracking_enabled: {
    label: "Track opens and clicks",
    hint: "Adds a pixel and rewrites links. Switch it off and campaign reports show delivery only — which is a legitimate choice, not a broken one.",
  },
  newsletter_signup_enabled: { label: "Accept signups from the site", hint: "The form on the public site." },
  tagline: { label: "Tagline", hint: "One line, used in structured data and social previews." },
  phone: { label: "Phone", hint: "Shown in the header bar and on the contact page." },
  support_email: { label: "Support email" },
  sales_email: { label: "Sales email" },
  address: { label: "Address", hint: "Shown in the footer and on the contact page. Line breaks are kept." },
  map_embed_url: {
    label: "Map embed URL",
    hint: "In Google Maps: Share, then Embed a map, then copy just the src=\"...\" value. Only Google embed URLs are accepted.",
    placeholder: "https://www.google.com/maps/embed?pb=...",
  },
  map_link: { label: "Map link", hint: "Where Open in Maps goes.", placeholder: "https://maps.google.com/?q=..." },
  default_meta_description: {
    label: "Default meta description",
    hint: "Used where a page has no description of its own. Over 320 characters and search engines truncate it.",
  },
  default_og_image: {
    label: "Default social image",
    hint: "Path to an image in the media library. 1200 x 630 px — the size every social network crops its preview to.",
  },
  portal_enabled: { label: "Customer portal enabled", hint: "1 to enable, 0 to disable." },
  customer_approval_required: {
    label: "Customer account activation required",
    hint: "1 to require staff approval before a self-registered account can sign in, 0 to activate it automatically the moment its email address is confirmed.",
  },
  default_login_method: {
    // The hint comes from the chosen option's own description, which the API
    // sends — see ChoiceField. Only the label is needed here.
    label: "Sign-in opens on",
  },
  otp_login_enabled: {
    label: "Customers sign in with a code",
    hint: "1 to enable, 0 to disable. On, the portal asks for an address and emails a six-digit code.",
  },
  otp_admin_login_enabled: {
    label: "Staff sign in with a code",
    hint: "1 to enable, 0 to disable. Convenient, and it makes the staff mailbox the only thing standing between an attacker and this console.",
  },
  password_login_enabled: {
    label: "Passwords still accepted",
    hint: "1 to enable, 0 to disable. Turning this off with mail misconfigured locks everybody out, and the way back in is a database edit.",
  },
  social_linkedin: { label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
  social_x: { label: "X", placeholder: "https://x.com/…" },
  social_facebook: { label: "Facebook", placeholder: "https://www.facebook.com/…" },
  social_instagram: { label: "Instagram", placeholder: "https://www.instagram.com/…" },
  social_youtube: { label: "YouTube", placeholder: "https://www.youtube.com/@…" },
  social_whatsapp: { label: "WhatsApp", placeholder: "https://wa.me/919876543210" },
  google_analytics_id: {
    label: "Google Analytics (GA4)",
    hint: "The measurement ID, which starts with G-. Leave blank to load nothing.",
    placeholder: "G-XXXXXXXXXX",
  },
  google_tag_manager_id: {
    label: "Google Tag Manager",
    hint: "Container ID. If GTM already loads Analytics for you, leave the GA4 field blank — setting both double-counts every pageview.",
    placeholder: "GTM-XXXXXXX",
  },
  google_site_verification: {
    label: "Google site verification",
    hint: "The content value from the meta tag Search Console gives you, not the whole tag.",
  },
  meta_pixel_id: {
    label: "Meta Pixel",
    hint: "Optional. The numeric Pixel ID from Events Manager.",
    placeholder: "1234567890123456",
  },
  meta_domain_verification: {
    label: "Meta domain verification",
    hint: "The content value from the meta tag Business Manager gives you.",
  },
  cookie_consent_enabled: {
    label: "Ask for consent",
    hint: "1 to require consent before any analytics loads, 0 to load it for everyone. With this off, the tags fire for every visitor.",
  },
  cookie_consent_title: { label: "Banner heading" },
  cookie_consent_message: { label: "Banner text", hint: "Placeholder copy — replace it with wording your legal adviser is happy with." },
  cookie_consent_accept_label: { label: "Accept button" },
  cookie_consent_reject_label: { label: "Decline button" },
  cookie_consent_policy_url: { label: "Policy link", hint: "Where “Read more” goes. Leave blank to hide the link.", placeholder: "/privacy" },
  smtp_host: { label: "SMTP host", placeholder: "smtp.example.com" },
  smtp_port: { label: "Port", placeholder: "587" },
  smtp_username: { label: "Username" },
  smtp_password: { label: "Password", hint: "Leave blank to keep the current one." },
  smtp_encryption: { label: "Encryption", hint: "tls, ssl, or none." },
  mail_from_address: { label: "From address", placeholder: "support@technoware.in" },
  mail_from_name: { label: "From name", placeholder: "Technoware Support" },
  openai_api_key: { label: "OpenAI API key", hint: "Stored for future use. Nothing on the site calls it yet." },
  hero_kicker: { label: "Hero badge", hint: "The small pill above the headline." },
  hero_heading: { label: "Hero headline", hint: "The last word is shown in the brand colour." },
  hero_lede: { label: "Hero paragraph" },
  hero_stats: {
    label: "Hero statistics",
    hint: "One per line as value|label, for example 340+|Sites under AMC. Four fit the row. These are currently invented figures — replace them before launch.",
  },
  support_stats: {
    label: "Support statistics",
    hint: "Same format, shown in the support band lower down the homepage. Also invented.",
  },
  testimonial_quote: { label: "Testimonial", hint: "Leave blank to hide the testimonial block entirely." },
  testimonial_author: { label: "Testimonial author" },
  testimonial_role: { label: "Testimonial role", placeholder: "IT Manager, Company" },
};

const GROUP_TITLES: Record<string, { title: string; blurb: string }> = {
  general: { title: "General", blurb: "Company identity, used across the site and in structured data." },
  contact: { title: "Contact", blurb: "Shown in the header bar, the footer and on the contact page." },
  homepage: {
    title: "Homepage",
    blurb: "The hero and the figures beneath it. The statistics seeded here are invented placeholders — they must be replaced or removed before launch.",
  },
  social: {
    title: "Social profiles",
    blurb: "Full URLs. Leave one blank and its icon disappears from the footer — better than linking to a profile that does not exist.",
  },
  appearance: {
    title: "Appearance",
    blurb: "The site's colour and type. One choice, applied everywhere — the public site, the customer portal and this console.",
  },
  newsletter: {
    title: "Newsletter",
    blurb: "Who campaigns come from, what the footer says, and how fast they go out. The postal address is not optional — a campaign without one is refused before it sends.",
  },
  seo: { title: "SEO defaults", blurb: "Fallbacks for pages with no override of their own." },
  analytics: {
    title: "Analytics",
    blurb: "Each loads only when its ID is filled in, and only on the public site — never inside this console or the customer portal. Consent gating is on by default; see the section below.",
  },
  consent: {
    title: "Cookie consent",
    blurb: "The banner shown before any analytics loads. It only appears when at least one analytics ID is set, because with none configured no cookie is ever placed and asking would be meaningless. The wording below is a starting point, not legal advice.",
  },
  mail: {
    title: "Outgoing mail",
    blurb: "Choose how mail leaves the site, then send a test to prove it. Leave the transport unset to keep using whatever the server's own configuration says. Every credential here is encrypted and none is ever shown again once saved.",
  },
  payments: {
    title: "Payments",
    blurb: "How the shop takes money, and the one thing that has to be done in the gateway's own dashboard. Every credential here is encrypted and none is ever shown again once saved.",
  },
  store: {
    title: "Store",
    blurb: "Whether the shop is open, which is a different question from whether a gateway is configured — the first is a decision, the second is a deployment that is not finished.",
  },
  integrations: {
    title: "API keys",
    blurb: "Encrypted, never returned to this screen, and never sent to the public site.",
  },
  support: { title: "Support", blurb: "Behaviour of the customer portal." },
  media: {
    title: "Media",
    blurb: "How hard the library compresses the images it makes — a resize, a crop, a thumbnail, a rotate. Uploads are stored exactly as they arrive, because re-encoding an original throws away quality nobody can get back, and it is the only copy there is. Changing this affects images edited from now on; it does not go back and re-encode what is already there.",
  },
  auth: {
    title: "Sign-in",
    blurb: "How people get in. A one-time code by email is the default for both the portal and this console; passwords remain available behind a link. Leave passwords on unless you are certain outgoing mail is reliable — with codes as the only way in, a broken mail configuration locks out every account, including yours.",
  },
};

/**
 * Field order within a group.
 *
 * The API returns settings sorted by key, which is alphabetical and therefore
 * meaningless: on General it put the favicon between the company name and the
 * tagline. Anything not listed keeps its API position, after the listed ones.
 */
const FIELD_ORDER: Record<string, string[]> = {
  general: ["company_name", "tagline", "logo_path", "favicon_path", "login_image_path"],
  contact: ["phone", "support_email", "sales_email", "address", "map_embed_url", "map_link"],
  homepage: ["hero_kicker", "hero_heading", "hero_lede", "hero_stats", "support_stats",
             "testimonial_quote", "testimonial_author", "testimonial_role"],
  mail: ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_encryption",
         "mail_from_address", "mail_from_name"],
  consent: ["cookie_consent_enabled", "cookie_consent_title", "cookie_consent_message",
            "cookie_consent_accept_label", "cookie_consent_reject_label", "cookie_consent_policy_url"],
};

const ORDER = ["general", "appearance", "contact", "homepage", "social", "seo", "analytics", "consent", "support", "auth", "store", "payments", "media", "mail", "integrations"];

/** Applies FIELD_ORDER, leaving unlisted keys in their API order at the end. */
function orderFields(group: string, rows: SettingGroups[string]) {
  const order = FIELD_ORDER[group];
  if (!order) return rows;

  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };

  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}

export function SettingsForm({
  groups, uploads, mail, payments,
}: {
  groups: SettingGroups;
  uploads: UploadLimits;
  mail: MailStatus;
  payments: PaymentsMeta;
}) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);

  const sorted = Object.keys(groups).sort(
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
        }))}
      >
        {sorted.map((group) => {
          const meta = GROUP_TITLES[group] ?? { title: group, blurb: "" };

          return (
            <section key={group}>
              {meta.blurb && <p className="measure mb-4 text-[13px] text-muted">{meta.blurb}</p>}

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

              {/* What the server will actually accept, above the field that
                  asks for a number. Read before typing, not after saving. */}
              {group === "media" && <ServerLimits uploads={uploads} />}

              <div className="grid gap-x-5 sm:grid-cols-2">
                {/* MailPanel renders the whole mail group itself: which fields
                    exist depends on the transport, which is not something a
                    flat list can say. */}
                {(group === "mail" || group === "payments" ? [] : orderFields(group, groups[group])).map((row) => {
                  const meta = LABELS[row.key] ?? { label: row.key };
                  const id = `setting__${row.key}`;
                  const isLong = row.type === "text";

                  // A theme id is a choice between ten looks, not a string
                  // to type. Same special-casing as the file fields below.
                  if (row.key === "theme") {
                    return <ThemePicker key={row.key} name={id} value={row.value} />;
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
                        {meta.hint && <p className="-mt-3 mb-4 text-[12.5px] text-faint">{meta.hint}</p>}
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
                            `contain`, not `cover`. Each of these is a mark
                            rather than a photograph: cropping a 600x81 logo into
                            an 80px strip shows the middle third of a wordmark,
                            and the file decides its own ratio because a client
                            uploaded it.
                          */
                        />
                        {meta.hint && <p className="-mt-3 mb-4 text-[12.5px] text-faint">{meta.hint}</p>}
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
              </div>
            </section>
          );
        })}
      </Tabs>

      {/* Outside the tabs on purpose: one Save covers the whole form, and a
          button that appeared to belong to the visible tab would imply the
          others were not being saved. */}
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <span className="text-[12.5px] text-muted">Saves every tab, not just this one.</span>
      </div>
    </Form>
  );
}

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
function ChoiceField({
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
function ServerLimits({ uploads }: { uploads: UploadLimits }) {
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
        <h2 className="mb-0.5 text-[13px] font-semibold">What this server allows</h2>
        <p className="measure mb-3 text-[12.5px] text-muted">
          Set by php.ini, not by this console. A limit above these does nothing
          — raising it means changing php.ini and restarting PHP.
        </p>

        <dl className="grid gap-x-5 gap-y-2 text-[12.5px] sm:grid-cols-3">
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
      <dt className="font-mono text-[11.5px] text-faint">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      <p className="text-[11.5px] text-faint">{note}</p>
    </div>
  );
}
