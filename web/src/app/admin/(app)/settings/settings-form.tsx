"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Field, Input, Textarea } from "@/components/ui/input";
import { saveSettingsAction, type SettingsFormState } from "./actions";
import type { SettingGroups } from "@/lib/admin";

const initial: SettingsFormState = {};

/** Human labels and hints, so the UI does not just show raw setting keys. */
const LABELS: Record<string, { label: string; hint?: string; placeholder?: string }> = {
  company_name: { label: "Company name" },
  tagline: { label: "Tagline", hint: "One line, used in structured data and social previews." },
  phone: { label: "Phone", hint: "Shown in the header bar and on the contact page." },
  support_email: { label: "Support email" },
  sales_email: { label: "Sales email" },
  address: { label: "Address" },
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
  support: { title: "Support", blurb: "Behaviour of the customer portal." },
};

const ORDER = ["general", "contact", "homepage", "social", "seo", "support"];

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
