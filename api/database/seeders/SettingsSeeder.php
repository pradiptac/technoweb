<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $settings = [
            ['group' => 'general', 'key' => 'logo_path', 'value' => null, 'type' => 'string'],
            ['group' => 'general', 'key' => 'favicon_path', 'value' => null, 'type' => 'string'],
            // The artwork beside the sign-in forms, staff and customer.
            // One image for both: they are the same moment, and two settings
            // would mean two things to remember to replace.
            ['group' => 'general', 'key' => 'login_image_path', 'value' => null, 'type' => 'string'],
            ['group' => 'general', 'key' => 'company_name', 'value' => 'Technoware', 'type' => 'string'],
            ['group' => 'general', 'key' => 'tagline', 'value' => 'Technology infrastructure that keeps your business connected.', 'type' => 'string'],
            // The homepage hero. These were hardcoded in the frontend, which
            // meant the invented figures on the must-not-ship list could only
            // be corrected by a developer. Group 'homepage' is public.
            ['group' => 'homepage', 'key' => 'hero_kicker', 'value' => 'Networking · Servers · Security · Surveillance', 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'hero_heading', 'value' => 'Technology infrastructure that keeps your business connected.', 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'hero_lede', 'value' => 'We design, deploy and support the networks, servers and security systems your operations run on — engineered properly the first time, then maintained by a support desk that actually answers.', 'type' => 'text'],
            // Four "value|label" pairs, one per line. A pair per line rather
            // than four settings each, because they are edited together and
            // an editor should be able to drop one without leaving a gap.
            ['group' => 'homepage', 'key' => 'hero_stats', 'value' => '16 yrs|In the field
340+|Sites under AMC
< 4 hrs|First response SLA
99.9%|Managed uptime', 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'support_stats', 'value' => '< 4h|First response
24/7|Critical escalation
96%|Resolved in SLA
340+|Sites covered', 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'testimonial_quote', 'value' => null, 'type' => 'text'],
            ['group' => 'homepage', 'key' => 'testimonial_author', 'value' => null, 'type' => 'string'],
            ['group' => 'homepage', 'key' => 'testimonial_role', 'value' => null, 'type' => 'string'],

            ['group' => 'contact', 'key' => 'phone', 'value' => '+91 98765 43210', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'support_email', 'value' => 'support@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'sales_email', 'value' => 'sales@technoware.in', 'type' => 'string'],
            ['group' => 'contact', 'key' => 'address', 'value' => 'Technoware
Unit 4, Lakeview Industrial Estate
Andheri East, Mumbai 400093', 'type' => 'text'],
            // A Google Maps embed URL. Validated on write against that one
            // host — this ends up as an iframe src, and an unchecked one is
            // somebody else's page rendered inside ours.
            ['group' => 'contact', 'key' => 'map_embed_url', 'value' => null, 'type' => 'text'],
            ['group' => 'contact', 'key' => 'map_link', 'value' => null, 'type' => 'string'],
            ['group' => 'seo', 'key' => 'default_meta_description', 'value' => 'Technoware designs, deploys and supports enterprise networks, servers, storage and security infrastructure.', 'type' => 'text'],
            ['group' => 'seo', 'key' => 'default_og_image', 'value' => '', 'type' => 'string'],
            ['group' => 'support', 'key' => 'portal_enabled', 'value' => '1', 'type' => 'boolean'],

            // Analytics. Public by nature — a GA measurement ID and a Pixel
            // ID are visible in the page source of every site that uses them,
            // so there is nothing to protect. They are not secrets and must
            // not be treated as such, or the frontend cannot read them.
            ['group' => 'analytics', 'key' => 'google_analytics_id', 'value' => null, 'type' => 'string'],
            ['group' => 'analytics', 'key' => 'google_tag_manager_id', 'value' => null, 'type' => 'string'],
            ['group' => 'analytics', 'key' => 'google_site_verification', 'value' => null, 'type' => 'string'],
            ['group' => 'analytics', 'key' => 'meta_pixel_id', 'value' => null, 'type' => 'string'],
            ['group' => 'analytics', 'key' => 'meta_domain_verification', 'value' => null, 'type' => 'string'],

            // Cookie consent. Public — the banner is rendered client-side
            // and needs every one of these.
            //
            // Enabled by default now that the copy exists: a site that loads
            // Google and Meta tags without asking is the thing this is here to
            // avoid, and defaulting it off would mean shipping that quietly.
            ['group' => 'consent', 'key' => 'cookie_consent_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'consent', 'key' => 'cookie_consent_title', 'value' => 'Cookies on this site', 'type' => 'string'],
            ['group' => 'consent', 'key' => 'cookie_consent_message', 'value' => 'We use analytics cookies to understand how visitors use this site, so we can make it better. They are optional — nothing here stops working if you decline, and we do not set them until you agree.', 'type' => 'text'],
            ['group' => 'consent', 'key' => 'cookie_consent_accept_label', 'value' => 'Accept analytics', 'type' => 'string'],
            ['group' => 'consent', 'key' => 'cookie_consent_reject_label', 'value' => 'Decline', 'type' => 'string'],
            ['group' => 'consent', 'key' => 'cookie_consent_policy_url', 'value' => '/privacy', 'type' => 'string'],

            // Outgoing mail. NOT in the public whitelist, and the password is
            // encrypted at rest and never returned to the browser. Leave the
            // host blank to keep using whatever the .env file configures.
            ['group' => 'mail', 'key' => 'smtp_host', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'smtp_port', 'value' => '587', 'type' => 'string'],
            ['group' => 'mail', 'key' => 'smtp_username', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'smtp_password', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'mail', 'key' => 'smtp_encryption', 'value' => 'tls', 'type' => 'string'],
            ['group' => 'mail', 'key' => 'mail_from_address', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'mail_from_name', 'value' => null, 'type' => 'string'],

            // Third-party keys. Same treatment as the SMTP password.
            ['group' => 'integrations', 'key' => 'openai_api_key', 'value' => null, 'type' => 'string', 'is_secret' => true],

            // Social profiles. Seeded empty on purpose — a blank value hides
            // the icon, so the footer never links to a profile that does not
            // exist yet. Fill these in from Settings in the admin.
            ['group' => 'social', 'key' => 'social_linkedin', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_facebook', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_x', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_instagram', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_youtube', 'value' => null, 'type' => 'string'],
            ['group' => 'social', 'key' => 'social_whatsapp', 'value' => null, 'type' => 'string'],
        ];

        foreach ($settings as $s) {
            // Create what is missing; never touch a value that already exists.
            //
            // This was updateOrCreate() with the value included, which meant
            // re-running the seeder silently overwrote everything an
            // administrator had entered — the phone number, the support
            // address, the social URLs, the homepage copy — with the defaults
            // below. Adding one new setting cost you all the others.
            //
            // group and type are structural rather than content, so those are
            // kept current on an existing row.
            $existing = Setting::where('key', $s['key'])->first();

            if ($existing) {
                $existing->forceFill([
                    'group' => $s['group'],
                    'type' => $s['type'],
                    'is_secret' => $s['is_secret'] ?? false,
                ])->save();

                continue;
            }

            $setting = new Setting([
                'group' => $s['group'],
                'key' => $s['key'],
                'type' => $s['type'],
                'is_secret' => $s['is_secret'] ?? false,
            ]);
            // Through setPlainValue so a seeded credential would be encrypted
            // like any other. They all seed null today; this stops that being
            // load-bearing.
            $setting->setPlainValue($s['value']);
            $setting->save();
        }
    }
}
