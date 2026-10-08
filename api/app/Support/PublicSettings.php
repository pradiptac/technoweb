<?php

namespace App\Support;

use App\Enums\MessageChannel;
use App\Enums\PaymentGateway;
use App\Models\Location;
use App\Models\Media;
use App\Models\Page;
use App\Models\Setting;
use App\Models\Solution;
use App\Support\Chat\ChatSettings;
use App\Support\Meetings\MeetingSettings;
use App\Support\Visits\VisitSettings;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The public `/settings` map — what the site needs to paint itself before
 * anybody is signed in, and nothing else.
 *
 * Extracted from `ContentController::settings()`, which had grown to 170
 * lines of whitelist, two named exceptions, a derived bit and the
 * path-to-URL map, on the most-read endpoint on the site. The rules are
 * unchanged and each still says why it is here; what changed is that they
 * can be read, and unit-tested, without a controller around them.
 */
class PublicSettings
{
    /**
     * The groups a visitor may read. Everything else — `mail`, `integrations`,
     * `payments`, `newsletter`, `chatbot`, `seo`, `media`, `security` — stays
     * server-side unless a key below names it deliberately.
     */
    public const GROUPS = ['general', 'contact', 'social', 'homepage', 'analytics', 'consent', 'appearance', 'motion', 'login', 'banners', 'announcement', 'themes', 'portal', 'auth', 'store', 'store_promo', 'store_tiles', 'blog', 'embeds', 'indexnow', 'push', 'pwa', 'action_bar', 'coming_soon'];

    /**
     * Rows in a public group that are nobody's business on this endpoint.
     *
     * `store` said for months that it held one key; it holds the digital
     * fulfilment switch and the activation procedure with its PDF — the
     * steps and the document a buyer receives *after paying*, published to
     * anybody who asked `/settings`. Named rather than moved to a new group,
     * because the settings screen reads them from `store` and a migration
     * of the rows would be a second change for the same fact.
     */
    public const PRIVATE_KEYS = ['activation_procedure', 'activation_pdf_path', 'digital_auto_fulfil', 'store_return_instructions'];

    /** The settings pictures that publish a blurred preview: the ones drawn large. */
    private const BLUR_PREFIXES = ['banner_', 'login_image', 'coming_soon_image', 'store_promo_image', 'store_tile_'];

    /** @return array<string, string> */
    public static function build(): array
    {
        // mail and integrations are deliberately absent: they hold the SMTP
        // credentials and the API key, and this endpoint has no authentication
        // in front of it.
        // `auth` says which sign-in methods are offered, never anything about
        // a credential. Both login screens are unauthenticated, so they cannot
        // render the right first step without it.
        // `store` is public for the shop's switch and its shipping, handling
        // and returns figures, which the storefront prints; the *payment*
        // keys are in `payments`, private like `mail`. It also holds three
        // rows the storefront never reads — see `PRIVATE_KEYS`.
        // `banners` is nine media paths and a switch — the picture behind each
        // section's page heading. It has to be public for the same reason
        // `appearance` is: the heading is painted before anybody signs in.
        $public = self::GROUPS;

        /*
         * Read from the cached rows rather than the table. This endpoint is
         * fetched by the frontend on every layout render and revalidation,
         * and it ran three `settings` queries per call while a cached copy
         * of the whole table already sat in the request. `rows_cached()`
         * holds only non-secret rows and raw string values — the two things
         * this endpoint needs and `all_cached()` does not provide.
         */
        $rows = collect(Setting::rows_cached());

        $values = $rows
            ->filter(fn (array $row, string $key) => in_array($row['group'], $public, true) && ! in_array($key, self::PRIVATE_KEYS, true))
            ->map(fn (array $row) => $row['value'])
            ->filter(fn ($v) => $v !== null && $v !== '');

        /*
         * One key from a private group, named explicitly.
         *
         * The whitelist is by *group*, which is the right default — a setting
         * added later is private until somebody deliberately publishes it. But
         * the `newsletter` group also holds the from-address and the batch
         * sizes, and the site needs exactly one fact from it: whether to draw
         * the signup form at all. A form that renders and then answers 403 is
         * worse than no form.
         *
         * Named rather than grouped, so this stays one considered exception
         * instead of a second whitelist that grows.
         */
        $signup = $rows['newsletter_signup_enabled']['value'] ?? null;

        if ($signup !== null) {
            $values['newsletter_signup_enabled'] = $signup;
        }

        /*
         * Four of the chatbot's settings, named for the same reason.
         *
         * That group also holds the model, the spend ceiling and the context
         * window, none of which is a visitor's business. The site needs
         * exactly what it takes to draw the thing before anybody speaks:
         * whether it exists, what it opens saying, what the chips offer, and
         * what it says when it cannot help. See `ChatSettings::PUBLIC_KEYS`.
         */
        foreach (ChatSettings::PUBLIC_KEYS as $key) {
            $value = $rows[$key]['value'] ?? null;

            if ($value !== null && $value !== '') {
                $values[$key] = $value;
            }
        }

        /*
         * The engineer-visit form's six, named for the same reason: the
         * `visits` group also holds the desk's email address and the default
         * booking length, neither of which is a visitor's business
         * (`VisitSettings::PUBLIC_KEYS`, 2026-09-26).
         */
        foreach (VisitSettings::PUBLIC_KEYS as $key) {
            $value = $rows[$key]['value'] ?? null;

            if ($value !== null && $value !== '') {
                $values[$key] = $value;
            }
        }

        /*
         * The meeting booking page's four, named for the same reason: the
         * `meetings` group also holds the desk's address, the per-contact and
         * per-address limits and the reminder offsets
         * (`MeetingSettings::PUBLIC_KEYS`, 2026-09-29, docs/meetings.md).
         */
        foreach (MeetingSettings::PUBLIC_KEYS as $key) {
            $value = $rows[$key]['value'] ?? null;

            if ($value !== null && $value !== '') {
                $values[$key] = $value;
            }
        }

        /*
         * Whether the shop can actually take money, which is not a setting.
         *
         * It is derived: a gateway is chosen *and* this server has its keys.
         * The storefront needs it before anybody authenticates, so it cannot
         * ask an admin endpoint — and it must not be a stored flag, which would
         * be a second answer free to disagree with the keys themselves.
         *
         * Nothing about the keys is published. This is one bit: yes or no.
         */
        $values['store_payments_ready'] = PaymentGateway::active() !== null ? '1' : '0';

        /*
         * Whether the announcement bar shows, decided here for the reason
         * `Announcement` gives: the switch, the window and the message are
         * three settings, and the frontend must not be the one combining
         * them against a visitor's clock. One bit, like the one above.
         */
        $values['announcement_live'] = Announcement::isLive($values->all()) ? '1' : '0';

        /*
         * The homepage as a builder page (0.113.0): the slug of the page the
         * id names, and only while it is a published builder page — so an
         * unpublished or deleted page puts the theme's homepage back rather
         * than leaving `/` addressed at nothing. The frontend fetches the
         * page by this slug; the id itself is not what it needs.
         */
        unset($values['homepage_page_id']);
        $homeId = Setting::get('homepage_page_id');
        if (filled($homeId)) {
            $slug = Page::query()->published()->where('template', 'builder')->whereKey((int) $homeId)->value('slug');
            if (is_string($slug) && $slug !== '') {
                $values['homepage_page_slug'] = $slug;
            }
        }

        /*
         * Which messaging channels the site may offer an opt-in for: the
         * checkout's WhatsApp and RCS boxes, the push bell. One bit each —
         * the provider and its keys are private (`messaging`), and a box
         * offered for a channel that cannot deliver is a promise broken at
         * the first order. Push also needs the browser half of Firebase,
         * the public `push` group, or the bell has nothing to subscribe with.
         */
        $values['messaging_whatsapp_live'] = MessageChannel::WhatsApp->ready() ? '1' : '0';
        $values['messaging_rcs_live'] = MessageChannel::Rcs->ready() ? '1' : '0';
        $values['push_live'] = MessageChannel::Push->ready() && collect(['push_api_key', 'push_project_id', 'push_messaging_sender_id', 'push_app_id', 'push_vapid_key'])
            ->every(fn (string $k) => filled($values[$k] ?? null)) ? '1' : '0';

        // A media path inside the theme options JSON needs its URL the way
        // every `_path` setting gets one below; the row is rewritten with an
        // `image_url` beside each `image_path`.
        if ($values->has('site_theme_options')) {
            $values['site_theme_options'] = ThemeOptions::withUrls($values['site_theme_options']);
        }

        /*
         * Every public setting whose key ends in `_path`, mapped to the
         * prefix its URL is published under: `logo_path` => `logo`, and so
         * `logo_url`.
         *
         * **Derived rather than listed, and that is the point of it.** This
         * was a hand-written map, and a hand-written list of keys on one side
         * of the wire is the drift this codebase keeps being bitten by — the
         * SEO overview's `admin_path` spelled with the API's resource names,
         * `schema_type_options` written out twice. A `_path` setting added to
         * the seeder and forgotten here is a picture the frontend can never
         * resolve, with nothing failing and nothing saying so. There are nine
         * banner paths; listing them would have been nine chances to miss one.
         *
         * The convention it relies on is already universal: every one of the
         * four keys this replaced was its own prefix plus `_path`.
         */
        $images = $values->keys()
            ->filter(fn (string $key) => str_ends_with($key, '_path'))
            ->mapWithKeys(fn (string $key) => [$key => Str::beforeLast($key, '_path')])
            ->all();

        /*
         * The natural dimensions travel with the URL, in one query for all
         * of them.
         *
         * Without them the frontend has to guess an aspect ratio in order to
         * reserve space, and a guess is wrong by definition: the file is
         * whatever the client uploaded. The header guessed 180x40 for a mark
         * that is 600x81, so the box was 126px until the image arrived and
         * 207px afterwards — and the navigation beside it visibly jumped
         * right on every cold load.
         *
         * `withTrashed`, because deleting a media row fills the bin and
         * **keeps the bytes**: the path still serves, so the image still
         * renders and its dimensions are still the truth about it.
         *
         * A path with no media row behind it — typed by hand, or uploaded
         * before the library recorded dimensions — simply carries no numbers,
         * and the frontend falls back. That is a smaller layout shift than
         * a wrong ratio, not a correct reservation.
         */
        $dimensions = Media::withTrashed()
            ->whereIn('path', collect($images)->keys()
                ->filter(fn ($k) => $values->has($k))
                ->map(fn ($k) => $values[$k])
                ->all())
            ->get(['path', 'width', 'height', 'focal_x', 'focal_y', 'blur'])
            ->keyBy('path');

        // Stored as paths, served as URLs — the same split the media library
        // and every cover image use. The path stays in the response so the
        // admin can round-trip it.
        foreach ($images as $path => $prefix) {
            if (! $values->has($path)) {
                continue;
            }

            $values[$prefix.'_url'] = MediaUrl::for($values[$path]);

            $file = $dimensions->get($values[$path]);

            if ($file?->width && $file?->height) {
                // Strings, like every other value in this map — it is a flat
                // key/value response and a caller reading one number as a
                // number and its neighbour as a string is a trap.
                $values[$prefix.'_width'] = (string) $file->width;
                $values[$prefix.'_height'] = (string) $file->height;
            }

            /*
             * And the focal point, on the same ride and by the same rule:
             * present when the file has one, absent when it does not — the
             * banners are cropped to 300px bands and the login picture to a
             * column, and where the subject sits is a fact about the file.
             * Read from the row here rather than through `MediaMeta`, which
             * loads only live rows; a binned banner still serves.
             */
            $focus = MediaMeta::format($file?->focal_x, $file?->focal_y);

            if ($focus !== null) {
                $values[$prefix.'_focus'] = $focus;
            }

            /*
             * The blurred preview (0.123.0), absent when the file has none —
             * and only for the pictures a page draws large. This map rides in
             * every public page's payload, so a preview for the logo, the
             * favicon or the app icon would be a few hundred bytes on every
             * page for a picture nobody watches load.
             */
            $blur = $file?->blur;

            if (is_string($blur) && $blur !== '' && Str::startsWith($prefix, self::BLUR_PREFIXES)) {
                $values[$prefix.'_blur'] = $blur;
            }
        }

        /*
         * Two derived lists for the `Organization` node, which the frontend
         * builds from this map (`lib/seo.tsx`): `knowsAbout` is the published
         * solutions' titles and `areaServed` the active locations' names.
         * JSON-encoded, because this is a flat map of strings and the
         * frontend already decodes `site_theme_options` from it the same
         * way. Absent rather than `[]` when there is nothing to say, so the
         * node carries no empty claim. Held under the settings' own cache
         * window; a solution renamed reaches the node when it turns over.
         */
        foreach (self::organizationFacts() as $key => $list) {
            if ($list !== []) {
                $values[$key] = json_encode($list, JSON_UNESCAPED_UNICODE) ?: '[]';
            }
        }

        return $values->all();
    }

    /**
     * What the company knows about and where it works, from the records that
     * say so. One cached read for both, on the same clock as the rest of
     * the public map.
     *
     * @return array{organization_knows_about: array<int, string>, organization_area_served: array<int, string>}
     */
    public static function organizationFacts(): array
    {
        return Cache::remember('public-settings:organization-facts', 600, fn () => [
            'organization_knows_about' => Solution::published()->orderBy('sort_order')->orderBy('title')->pluck('title')->values()->all(),
            'organization_area_served' => Location::active()->orderBy('sort_order')->orderBy('name')->pluck('name')->values()->all(),
        ]);
    }
}
