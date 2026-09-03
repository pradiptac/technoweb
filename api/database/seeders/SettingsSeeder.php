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
             * The shared secret a bounce webhook has to prove it knows.
             *
             * Required, not optional: this endpoint *suppresses* addresses, so
             * an unauthenticated one is a way for anybody who finds the URL to
             * remove the client's entire list from every future campaign. With
             * no secret configured nothing is accepted at all — the endpoint
             * still answers 200, because a provider reads anything else as
             * "retry", but it acts on nothing.
             *
             * Secret at rest for the reason the SMTP password is: it is a
             * credential, and the admin response says only whether one is set.
             */
            ['group' => 'newsletter', 'key' => 'newsletter_webhook_secret', 'value' => null, 'type' => 'string', 'is_secret' => true],

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

            /*
             * The website assistant.
             *
             * **Off by default**, and that is not timidity: switched on it
             * spends money on every message, and a module that starts billing
             * the moment a migration runs is one nobody agreed to. Four of
             * these are published to the site — see `ChatSettings::PUBLIC_KEYS`
             * — because the button, the welcome, the chips and the fallback
             * are all rendered before anybody says anything. The rest are not:
             * the model, the ceilings and the context window are nobody's
             * business but the operator's.
             */
            /*
             * The blog's sidebar video.
             *
             * Its own group, and that group is public: a setting the site
             * cannot read is a setting that does nothing, which is exactly
             * what this was until the row existed. Everything filed under
             * `blog` must therefore be presentational — nothing here is a
             * secret, because the whole group is published.
             *
             * Empty by default. The widget is absent rather than showing an
             * empty panel, so an install that never sets it renders a sidebar
             * with one fewer card and no gap.
             */
            ['group' => 'blog', 'key' => 'blog_video_url', 'value' => null, 'type' => 'string'],

            /*
             * Comments, site-wide.
             *
             * **Default off.** Switched on this puts a public form on every
             * article and a moderation queue on somebody's desk, and an
             * unmoderated form fills with spam within days — so it is a
             * decision somebody takes, not one they inherit. The same call
             * `chatbot_enabled` makes for the opposite reason: that one spends
             * money, this one spends attention.
             *
             * Public, because the blog page is rendered before anybody
             * authenticates and has to know whether to draw the form.
             */
            ['group' => 'blog', 'key' => 'comments_enabled', 'value' => '0', 'type' => 'boolean'],

            /*
             * Close comments on an article this many days after publication.
             *
             * Zero means never, which is the honest reading of an empty
             * setting. An old article is where comment spam concentrates —
             * nobody is watching and there is no conversation left to
             * interrupt — so this is the one anti-spam measure that costs a
             * real reader nothing.
             */
            ['group' => 'blog', 'key' => 'comments_closed_after_days', 'value' => '0', 'type' => 'string'],

            ['group' => 'chatbot', 'key' => 'chatbot_enabled', 'value' => '0', 'type' => 'boolean'],
            ['group' => 'chatbot', 'key' => 'chatbot_welcome', 'value' => null, 'type' => 'text'],
            ['group' => 'chatbot', 'key' => 'chatbot_fallback', 'value' => null, 'type' => 'text'],

            /*
             * `Label|what it asks`, one per line. The label is what somebody
             * presses and the second half is what gets sent, because "Need
             * support" is a good button and a poor question. Same one-per-line
             * shape as the homepage statistics, so an editor here has met the
             * format before.
             */
            ['group' => 'chatbot', 'key' => 'chatbot_quick_actions', 'value' => null, 'type' => 'text'],

            /*
             * Blank means the model in `config/services.php`, the arrangement
             * mail already uses: settings first, `.env` second, so a fresh
             * install works before anybody opens the console.
             */
            ['group' => 'chatbot', 'key' => 'chatbot_model', 'value' => null, 'type' => 'string'],

            // The three that bound the cost. A rate limit bounds one visitor;
            // only the daily ceiling bounds the bill.
            ['group' => 'chatbot', 'key' => 'chatbot_max_message_chars', 'value' => '1000', 'type' => 'string'],
            ['group' => 'chatbot', 'key' => 'chatbot_max_messages', 'value' => '40', 'type' => 'string'],
            ['group' => 'chatbot', 'key' => 'chatbot_context_messages', 'value' => '10', 'type' => 'string'],
            ['group' => 'chatbot', 'key' => 'chatbot_daily_reply_cap', 'value' => '500', 'type' => 'string'],

            /*
             * A transcript is personal data given by somebody with no account
             * to come back and delete it themselves, so deletion is the default
             * rather than a decision — the same argument the CV prune is built
             * on. A 7-day floor is enforced in the command.
             */
            ['group' => 'security', 'key' => 'chat_retention_days', 'value' => '90', 'type' => 'string'],

            /*
             * How long a JavaScript failure is kept.
             *
             * Shorter than the activity log's ninety days, and for the opposite
             * reason: this is not evidence about a person, it is a list of what
             * is broken *now*. A bug nobody has seen for a month is either fixed
             * or unreachable, and either way it is noise on the screen that
             * exists to show the current ones.
             */
            ['group' => 'security', 'key' => 'client_error_retention_days', 'value' => '30', 'type' => 'string'],

            /*
             * How long a spam or binned comment is kept.
             *
             * Kept at all, and that is the point: spam is the only place a real
             * comment filed by mistake can be found again, which is the failure
             * this whole module is arranged to avoid. Published and waiting
             * comments never age out.
             */
            ['group' => 'security', 'key' => 'comment_retention_days', 'value' => '30', 'type' => 'string'],

            ['group' => 'portal', 'key' => 'portal_enabled', 'value' => '1', 'type' => 'boolean'],
            ['group' => 'portal', 'key' => 'registration_enabled', 'value' => '1', 'type' => 'boolean'],

            /*
             * Whether a self-registered account needs a human to look at it
             * before it can sign in, or goes straight to `active` the moment
             * its address is confirmed.
             *
             * Public, like the two settings above it: the verify-email screen
             * has to know which sentence to show ("you can sign in now" or "a
             * member of our team will activate your account shortly"), and it
             * renders before anybody is authenticated.
             *
             * Default **off** — a fresh install auto-activates. `RegistrationController`
             * is the only place this is read; everything downstream (login,
             * the verify-email response, the desk notification) already
             * branches on the customer's own `status`, so nothing else needed
             * to change for this to be safe either way.
             */
            ['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean'],

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

            /*
             * Which step a sign-in form opens on.
             *
             * Separate from the three switches above, because "may somebody use
             * a password" and "is a password what we offer first" are different
             * questions — a shop can keep both routes open and still decide
             * which one most people should meet. The other is always a link
             * away, so this changes the default rather than closing a door.
             *
             * Public, like the switches, because both sign-in screens render
             * before anybody is authenticated and cannot draw the right first
             * step otherwise.
             *
             * If the chosen default is switched off, the form falls back to
             * whatever is still enabled rather than opening on a step that
             * cannot work — an install with codes as the default and mail
             * broken has to leave somebody a way in.
             */
            ['group' => 'auth', 'key' => 'default_login_method', 'value' => 'otp', 'type' => 'string'],

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
            /*
             * The payment gateway, and its keys.
             *
             * A **private** group, like `mail` and `integrations`: the key
             * secret and the webhook secret are credentials, encrypted at rest
             * and never returned to the browser. The *key id* is not a secret —
             * it is in the script tag on every Razorpay checkout there is — but
             * it lives here anyway, because a settings group is a place rather
             * than a classification and splitting one provider's keys across two
             * of them is how the wrong one ends up in the wrong place.
             *
             * Blank rather than 'razorpay': an install with no keys must render
             * "we cannot take payment online" rather than a button that throws.
             * The storefront reads `store_payments_enabled` for that, which is
             * public because a page has to know before anybody authenticates.
             */
            ['group' => 'payments', 'key' => 'payment_gateway', 'value' => null, 'type' => 'string'],
            ['group' => 'payments', 'key' => 'razorpay_key_id', 'value' => null, 'type' => 'string'],
            ['group' => 'payments', 'key' => 'razorpay_key_secret', 'value' => null, 'type' => 'string', 'is_secret' => true],
            ['group' => 'payments', 'key' => 'razorpay_webhook_secret', 'value' => null, 'type' => 'string', 'is_secret' => true],

            /*
             * The three that do not settle by themselves.
             *
             * Each is a switch plus the one detail it cannot work without, and
             * `PaymentMethod::isAvailable()` checks both — a bank transfer with
             * no account number is instructions nobody can follow, and offering
             * it anyway is a checkout that fails after the address has been
             * typed.
             *
             * None of them is secret. A UPI ID and a set of account details are
             * printed on an invoice and read out on the telephone; marking them
             * secret would encrypt them and then refuse to show them back to
             * the person who typed them, for no gain at all.
             */
            ['group' => 'payments', 'key' => 'cod_enabled', 'value' => '0', 'type' => 'boolean'],
            /*
             * A ceiling, because cash on delivery is unsecured credit. A refused
             * parcel is the shop's loss both ways, and the risk scales with the
             * value; the shop decides where that line is. Zero means no ceiling.
             */
            ['group' => 'payments', 'key' => 'cod_max_paise', 'value' => '2500000', 'type' => 'string'],

            ['group' => 'payments', 'key' => 'bank_transfer_enabled', 'value' => '0', 'type' => 'boolean'],
            ['group' => 'payments', 'key' => 'bank_account_details', 'value' => null, 'type' => 'text'],

            ['group' => 'payments', 'key' => 'upi_enabled', 'value' => '0', 'type' => 'boolean'],
            ['group' => 'payments', 'key' => 'upi_id', 'value' => null, 'type' => 'string'],
            ['group' => 'payments', 'key' => 'upi_qr_path', 'value' => null, 'type' => 'string'],
            /*
             * Whether the shop is open, which is a different question from
             * whether a gateway is configured.
             *
             * Both have to be true to take money, and they fail differently: an
             * unconfigured gateway is a deployment that is not finished, and
             * this is somebody deciding to stop selling for a fortnight.
             */
            ['group' => 'store', 'key' => 'store_enabled', 'value' => '1', 'type' => 'boolean'],

            /*
             * Whether an activation code is handed over the moment payment
             * lands, or waits for somebody.
             *
             * Both answers are real. Automatic is what a licence buyer expects
             * — they paid for a key and want it now, and a shop that makes them
             * wait until Monday has sold them a worse product than the one down
             * the road. Manual is what a business wants while it is watching a
             * new gateway settle, or while codes are bought in per order.
             *
             * Defaults to on, because a digital order sitting untouched is the
             * surprising outcome and this exists to turn that off.
             */
            ['group' => 'store', 'key' => 'digital_auto_fulfil', 'value' => '1', 'type' => 'boolean'],

            /*
             * What to do with an activation code, when the product does not say
             * something of its own.
             *
             * A shop selling one vendor's licences writes this once; a shop
             * selling six overrides per product. Not public: it is transactional
             * email content and reaches a customer through the order, never
             * through `/settings`.
             */
            ['group' => 'store', 'key' => 'activation_procedure', 'value' => null, 'type' => 'text'],
            ['group' => 'store', 'key' => 'activation_pdf_path', 'value' => null, 'type' => 'string'],

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
