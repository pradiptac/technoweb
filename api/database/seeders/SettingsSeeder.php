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
            ['group' => 'contact', 'key' => 'careers_email', 'value' => 'careers@technoware.in', 'type' => 'string'],
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
            /*
             * What the public site is allowed to offer. Public, because the
             * frontend cannot decide whether to render a "Create an account"
             * link without reading them — a toggle the site cannot see is a
             * toggle that does nothing, which is what `portal_enabled` was
             * until self-registration gave it a reader.
             */
            /*
             * How long staff activity is kept before the nightly prune deletes
             * it. Private: this is operational policy, not something the public
             * site has any business reading.
             *
             * A floor of 30 days is enforced in the command whatever is stored
             * here, so a typo cannot destroy the audit trail.
             */
            /*
             * How hard derived images are compressed — a resize, a crop, a
             * thumbnail, a rotate. Not uploads: those are stored byte-for-byte,
             * because re-encoding an original discards quality nobody can get
             * back. `App\Enums\ImageQuality` owns the five presets and what
             * each one means for JPEG, PNG and WebP, which differ.
             *
             * Its own group rather than a corner of General: it is the only
             * setting that changes what a *file* looks like, and it belongs
             * beside the library it governs.
             */
            ['group' => 'media', 'key' => 'image_quality', 'value' => 'good', 'type' => 'string'],

            /*
             * The largest file the media library accepts, in kilobytes.
             *
             * A setting rather than `config/media.php` because the person who
             * needs to raise it is the one running the site, not the one with
             * a deploy. `App\Support\UploadLimits` clamps it to what PHP will
             * actually accept — a number above `upload_max_filesize` or
             * `post_max_size` does nothing except break uploads in a way the
             * console cannot explain, so the console shows both.
             */
            ['group' => 'media', 'key' => 'media_max_kb', 'value' => '5120', 'type' => 'string'],
            ['group' => 'media', 'key' => 'media_max_video_kb', 'value' => '20480', 'type' => 'string'],

            /*
             * The newsletter.
             *
             * A group of its own rather than sharing `mail`: those are the
             * SMTP credentials and are private and encrypted, while these are
             * the words in a footer. Not on the public whitelist either —
             * nothing here is read by the site, and the postal address is a
             * business fact rather than a page's content.
             */
            ['group' => 'newsletter', 'key' => 'newsletter_company', 'value' => null, 'type' => 'string'],
            ['group' => 'newsletter', 'key' => 'newsletter_from_name', 'value' => null, 'type' => 'string'],
            ['group' => 'newsletter', 'key' => 'newsletter_from_email', 'value' => null, 'type' => 'string'],
            ['group' => 'newsletter', 'key' => 'newsletter_reply_to', 'value' => null, 'type' => 'string'],

            /*
             * The postal address that goes in every footer.
             *
             * Required by anti-spam law in several countries and read as a
             * trust signal everywhere else, which is why the health check
             * treats its absence as **blocking** rather than as advice.
             */
            ['group' => 'newsletter', 'key' => 'newsletter_address', 'value' => null, 'type' => 'string'],
            ['group' => 'newsletter', 'key' => 'newsletter_footer_text', 'value' => null, 'type' => 'string'],

            /*
             * Batch size and the gap between batches, so a relay's rate limit
             * is something to configure rather than to redeploy for. Brevo,
             * Mailgun and SES all publish different ones.
             */
            ['group' => 'newsletter', 'key' => 'newsletter_batch_size', 'value' => '100', 'type' => 'string'],
            ['group' => 'newsletter', 'key' => 'newsletter_batch_delay', 'value' => '0', 'type' => 'string'],

            // A pixel and rewritten links are personal-data collection, so a
            // client who decides against them needs a switch, not a developer.
            ['group' => 'newsletter', 'key' => 'newsletter_tracking_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'newsletter', 'key' => 'newsletter_signup_enabled', 'value' => '1', 'type' => 'boolean'],

            /*
             * A separate ceiling from the file size, because the two constrain
             * different resources. A well-compressed 12000x9000 JPEG fits
             * inside 5MB and costs GD ~4 bytes per pixel once decoded — past
             * `memory_limit`, which ends the request with a fatal error rather
             * than a message somebody can act on.
             */
            ['group' => 'media', 'key' => 'media_max_megapixels', 'value' => '50', 'type' => 'string'],

            ['group' => 'security', 'key' => 'activity_retention_days', 'value' => '90', 'type' => 'string'],

            /*
             * How long a candidate's application and CV are kept before the
             * nightly prune deletes both. The most sensitive personal data here,
             * given by somebody with no account to come back and remove it
             * themselves -- so deletion is the default rather than a decision.
             * A 30-day floor is enforced in the command.
             */
            ['group' => 'security', 'key' => 'application_retention_days', 'value' => '180', 'type' => 'string'],

            ['group' => 'portal', 'key' => 'portal_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'portal', 'key' => 'registration_enabled', 'value' => '1', 'type' => 'boolean'],

            /*
             * How people sign in. **Public**, and it has to be: both login
             * screens are rendered before anybody is authenticated, so a flag
             * the site cannot read is a flag that decides nothing — which is
             * exactly what `portal_enabled` was until something read it.
             * Whether codes are offered is not a secret; the codes are.
             *
             * `password_login_enabled` is the escape hatch, and the reason it
             * is a separate switch: mail is configured from the console and can
             * be misconfigured from the console. An install that has turned off
             * passwords and then broken its SMTP settings has locked out every
             * administrator, and the way back in is a database edit.
             */
            ['group' => 'auth', 'key' => 'otp_login_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'auth', 'key' => 'otp_admin_login_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'auth', 'key' => 'password_login_enabled', 'value' => '1', 'type' => 'boolean'],

            // Analytics. Public by nature — a GA measurement ID and a Pixel
            // ID are visible in the page source of every site that uses them,
            // so there is nothing to protect. They are not secrets and must
            // not be treated as such, or the frontend cannot read them.
            /*
             * The site's visual direction. The value is a theme id from
             * web/src/lib/themes.ts, and the frontend falls back to the
             * default for anything it does not recognise — so a value typed
             * straight into the database cannot produce a half-themed page.
             */
            ['group' => 'appearance', 'key' => 'theme', 'value' => 'olive', 'type' => 'string'],

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

            /*
             * Which transport, and what each one needs. See App\Enums\MailTransport.
             *
             * Blank rather than 'smtp': an install that has never opened this
             * screen must go on using whatever .env says, which is how a first
             * deploy and every development machine work.
             *
             * Every credential here is is_secret, encrypted at rest and never
             * returned to the browser — the same treatment the SMTP password
             * already had. `mail_api_key` is shared by Brevo and Mailgun
             * because only one transport is ever active; two rows would be two
             * places to look when the wrong key is in the wrong one.
             */
            /*
             * How many programmatic landing pages may be published at once.
             *
             * In `seo` rather than `general` because it is a ranking decision,
             * and a number rather than a toggle because the risk in generated
             * pages is volume: forty good ones help, four hundred thin ones are
             * a manual action against the whole domain. Raising it is meant to
             * be a deliberate act on this screen. See App\Support\LandingPageQuality.
             */
            ['group' => 'seo', 'key' => 'landing_page_cap', 'value' => '40', 'type' => 'string'],

            ['group' => 'mail', 'key' => 'mail_transport', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'mail_api_key', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'mail', 'key' => 'mailgun_domain', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'mailgun_endpoint', 'value' => 'api.mailgun.net', 'type' => 'string'],
            ['group' => 'mail', 'key' => 'ses_key', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'ses_secret', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'mail', 'key' => 'ses_region', 'value' => 'ap-south-1', 'type' => 'string'],

            // The connected Google mailbox. `oauth_account` is the address it
            // belongs to, which is the only part of this a person ever sees.
            ['group' => 'mail', 'key' => 'oauth_client_id', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'oauth_client_secret', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'mail', 'key' => 'oauth_refresh_token', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'mail', 'key' => 'oauth_account', 'value' => null, 'type' => 'string'],
            ['group' => 'mail', 'key' => 'oauth_connected_at', 'value' => null, 'type' => 'string'],

            // Why mail last failed. Written by the code that swallows the
            // failure, so that swallowing leaves a mark somebody can see.
            ['group' => 'mail', 'key' => 'mail_error', 'value' => null, 'type' => 'string'],

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
