"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { CoverField } from "@/components/admin/cover-field";
import { ClearSecretButton } from "./clear-secret-button";
import { saveSettingsAction, type SettingsFormState } from "./actions";
import type { SettingGroups } from "@/lib/admin";

const initial: SettingsFormState = {};

/** Human labels and hints, so the UI does not just show raw setting keys. */
const LABELS: Record<string, { label: string; hint?: string; placeholder?: string }> = {
  company_name: { label: "Company name" },
  logo_path: { label: "Logo", hint: "Upload below. Leave empty to use the TECHNOWARE wordmark." },
  favicon_path: { label: "Favicon", hint: "The small icon in the browser tab. A square PNG or SVG works best." },
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
  default_og_image: { label: "Default social image", hint: "Path to an image in the media library." },
  portal_enabled: { label: "Customer portal enabled", hint: "1 to enable, 0 to disable." },
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
    blurb: "Leave the host blank to keep using whatever the server is configured with. The password is encrypted and is never shown again once saved.",
  },
  integrations: {
    title: "API keys",
    blurb: "Encrypted, never returned to this screen, and never sent to the public site.",
  },
  support: { title: "Support", blurb: "Behaviour of the customer portal." },
};

const ORDER = ["general", "contact", "homepage", "social", "seo", "analytics", "consent", "support", "mail", "integrations"];

export function SettingsForm({ groups }: { groups: SettingGroups }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initial);

  const sorted = Object.keys(groups).sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <form action={formAction} noValidate>
      {state.error && <Alert tone="err" title="Could not save">{state.error}</Alert>}
      {state.ok && !state.error && (
        <Alert tone="ok" title="Settings saved">The site picks these up immediately.</Alert>
      )}

      <div className="grid gap-5">
        {sorted.map((group) => {
          const meta = GROUP_TITLES[group] ?? { title: group, blurb: "" };

          return (
            <section key={group} className="rounded-lg border border-line-strong bg-white p-5">
              <h3 className="text-[15px] font-semibold">{meta.title}</h3>
              {meta.blurb && <p className="mt-0.5 mb-4 max-w-[70ch] text-[13px] text-muted">{meta.blurb}</p>}

              <div className="grid gap-x-5 sm:grid-cols-2">
                {groups[group].map((row) => {
                  const meta = LABELS[row.key] ?? { label: row.key };
                  const id = `setting__${row.key}`;
                  const isLong = row.type === "text";

                  // Logo and favicon are files, not text. CoverField uploads
                  // to the media library and puts the returned path in a
                  // hidden input, which is exactly what the setting stores.
                  if (row.key === "logo_path" || row.key === "favicon_path") {
                    return (
                      <div key={row.key} className="sm:col-span-2">
                        <CoverField
                          name={id}
                          label={meta.label}
                          defaultPath={row.value}
                          defaultUrl={row.url ?? null}
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
      </div>

      <div className="mt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
